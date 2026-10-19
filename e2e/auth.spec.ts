import { expect, test, type Page } from "@playwright/test";
import {
  createTestUser,
  sessionCookieFor,
  testPrisma,
} from "./helpers/auth";

test.describe.configure({ mode: "serial" });

test.setTimeout(60_000);

const SESSION_COOKIE = "session";

/**
 * Dev hydration (TanStack Start + Vite) is slow; clicking the form before
 * hydration completes silently drops the submit. Wait for the page to settle.
 */
async function goTo(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

function uniqueEmail(): string {
  return `e2e-user-${Date.now()}-${Math.round(Math.random() * 1e9)}@e2e.test`;
}

async function fillAndSubmitSignIn(page: Page, email: string, password: string): Promise<void> {
  await goTo(page, "/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function fillAndSubmitSignUp(
  page: Page,
  name: string,
  email: string,
  password: string,
): Promise<void> {
  // Vite in dev may optimize the server-fn module on first use and reload the
  // page mid-submit, silently losing the attempt — retry once.
  for (let attempt = 0; attempt < 2; attempt++) {
    await goTo(page, "/create-account");
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await page
      .waitForFunction(() => window.location.pathname !== "/create-account", { timeout: 10_000 })
      .catch(() => {}); // still on the form after the settle window
    if (new URL(page.url()).pathname !== "/create-account") return;
  }
}

test.beforeEach(async ({ request }) => {
  // The endpoint is protected by TanStack Start's native CSRF middleware, whose
  // strict default rejects requests that carry no Sec-Fetch-Site/Origin/Referer
  // metadata. Playwright's APIRequestContext sends none of them, so we send an
  // explicit same-origin Origin header (matching the app's own origin).
  const response = await request.post("/api/dev-reset-rate-limits", {
    headers: { origin: "http://localhost:3000" },
  });
  expect(response.status()).toBe(200);
});

test("sign-up stores an argon2id hash, never the plaintext", async ({ page }) => {
  const email = uniqueEmail();
  const password = "s3cure-password";

  await fillAndSubmitSignUp(page, "E2E Encrypt", email, password);

  // Either redirected into the app or onto the sign-in screen counts as "created".
  await expect(page).not.toHaveURL(/\/create-account/);
  await expect(page.getByLabel("Email").or(page.getByText("Logged in as")).first()).toBeVisible({
    timeout: 15_000,
  });

  const user = await testPrisma.user.findUnique({ where: { email } });
  expect(user).not.toBeNull();
  expect(user!.password).toMatch(/^\$argon2id\$/);
  expect(user!.password).not.toBe(password);
});

test("sign-in accepts the correct password", async ({ page }) => {
  const { email } = await createTestUser();

  await fillAndSubmitSignIn(page, email, "e2test-password");

  await expect(page).not.toHaveURL(/\/sign-in/);
  await expect(page.getByText("Logged in as")).toBeVisible({ timeout: 15_000 });
});

test("sign-in rejects a wrong password with a generic error", async ({ page }) => {
  const { email } = await createTestUser();

  await fillAndSubmitSignIn(page, email, "wrong-password");

  await expect(page.getByText("Invalid email or password")).toBeVisible({ timeout: 15_000 });
  expect(new URL(page.url()).pathname).toBe("/sign-in");
});

test("legacy plaintext row is lazily migrated on sign-in", async ({ page }) => {
  const email = uniqueEmail();
  await testPrisma.user.create({
    data: { email, name: "Legacy User", password: "legacy-plaintext" },
  });

  await fillAndSubmitSignIn(page, email, "legacy-plaintext");

  await expect(page).not.toHaveURL(/\/sign-in/);
  await expect(page.getByText("Logged in as")).toBeVisible({ timeout: 15_000 });

  const user = await testPrisma.user.findUnique({ where: { email } });
  expect(user!.password).toMatch(/^\$argon2id\$/);
});

test("password with special characters round-trips", async ({ page }) => {
  const email = uniqueEmail();
  const password = "P@$$w0rd é🎉 & $ymbols";

  await fillAndSubmitSignUp(page, "Special Chars", email, password);
  await expect(page.getByText("Logged in as")).toBeVisible({ timeout: 15_000 });

  // Log out via the (now POST-only) logout page.
  await goTo(page, "/logout");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);

  await fillAndSubmitSignIn(page, email, password);
  await expect(page.getByText("Logged in as")).toBeVisible({ timeout: 15_000 });
});

test("6th sign-in attempt in a minute is rate limited", async ({ page }) => {
  const { email } = await createTestUser();

  for (let attempt = 1; attempt <= 5; attempt++) {
    await fillAndSubmitSignIn(page, email, "wrong-password");
    await expect(page.getByText("Invalid email or password")).toBeVisible({ timeout: 15_000 });
  }

  await fillAndSubmitSignIn(page, email, "wrong-password");
  await expect(page.getByText("Too many attempts. Try again shortly.")).toBeVisible({
    timeout: 15_000,
  });
});

test("cross-origin POST is rejected", async ({ page }) => {
  const { email } = await createTestUser();

  // Simulate a genuinely cross-site request. TanStack Start's native CSRF
  // middleware trusts the browser-computed `Sec-Fetch-Site` header first, so a
  // forged `Origin` alone is not enough: the browser recomputes
  // `Sec-Fetch-Site: same-origin` for a same-origin target and the middleware
  // trusts it. Re-targeting the server-function POST at a different origin
  // (127.0.0.1 instead of localhost) makes the browser send
  // `Sec-Fetch-Site: cross-site`, which the middleware rejects with 403 before
  // any session cookie is issued.
  await page.route("**/_serverFn/**", (route) =>
    route.continue({
      url: route.request().url().replace("//localhost:3000/", "//127.0.0.1:3000/"),
      headers: { ...route.request().headers(), origin: "https://evil.example" },
    }),
  );

  await fillAndSubmitSignIn(page, email, "e2test-password");

  // Should not land in the app and no session cookie may be set.
  await page.waitForTimeout(2_000);
  expect(new URL(page.url()).pathname).not.toBe("/");
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === SESSION_COOKIE)).toBeUndefined();
});

test("logout clears the session", async ({ page }) => {
  const { id, email } = await createTestUser();
  await page.context().addCookies(sessionCookieFor(id));

  await goTo(page, "/");
  await expect(page.getByText("Logged in as")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(email).or(page.getByText("E2E User")).first()).toBeVisible();

  await goTo(page, "/logout");
  await page.getByRole("button", { name: "Log out" }).click();

  await expect(page).toHaveURL(/\/sign-in/);
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === SESSION_COOKIE)).toBeUndefined();

  // The old cookie no longer grants access.
  await goTo(page, "/");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("movements require authentication", async ({ browser }) => {
  const context = await browser.newContext(); // fresh, no cookies
  const page = await context.newPage();

  await goTo(page, "/movements");
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

  await context.close();
});
