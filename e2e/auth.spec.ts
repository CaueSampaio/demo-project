import { type Page, type Response } from "@playwright/test";
import { createAccount, expect, resetRateLimits, signIn, test, uniqueEmail } from "./fixtures";
import { testPrisma } from "./helpers/db";

const SESSION_COOKIE = "session";

// Must match TEST_PASSWORD in ./fixtures.
const TEST_PASSWORD = "e2test-password";

/** Submits the sign-in form without retrying, so negative-path tests see the failure response. */
async function submitSignInForm(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Signs out through the real /logout page and lands back on the sign-in screen. */
async function logOut(page: Page): Promise<void> {
  await page.goto("/logout");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
}

/** Submits on the already-loaded page and returns the reply body (used for the confirming rate-limit attempt). */
async function submitSignInAttempt(page: Page, email: string, password: string): Promise<string> {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        r.url().includes("_serverFn") &&
        (r.request().postData() ?? "").includes(email),
    ),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
  return response.text();
}

/**
 * Fires `count` concurrent sign-in submits via `requestSubmit()`, bypassing the
 * button's in-flight disable, and resolves once every reply has landed.
 */
async function burstSignInAttempts(page: Page, email: string, count: number): Promise<void> {
  let pending = count;
  let resolveSettled!: () => void;
  const settled = new Promise<void>((resolve) => {
    resolveSettled = resolve;
  });
  const onResponse = (response: Response) => {
    const request = response.request();
    if (request.method() !== "POST" || !response.url().includes("_serverFn")) return;
    if (!(request.postData() ?? "").includes(email)) return;
    pending -= 1;
    if (pending === 0) {
      page.off("response", onResponse);
      resolveSettled();
    }
  };
  page.on("response", onResponse);
  await page.evaluate((n) => {
    const form = document.querySelector("form");
    if (!form) throw new Error("sign-in form missing");
    for (let i = 0; i < n; i++) form.requestSubmit();
  }, count);
  // Guard against a request that never produces a response.
  await Promise.race([settled, page.waitForTimeout(10_000)]);
}

test("sign-up stores an argon2id hash, never the plaintext", async ({ page, request }) => {
  await resetRateLimits(request);
  const email = uniqueEmail();
  const password = "s3cure-password";

  await createAccount(page, request, { name: "E2E Encrypt", email, password });

  const user = await testPrisma.user.findUnique({ where: { email } });
  expect(user).not.toBeNull();
  expect(user!.password).toMatch(/^\$argon2id\$/);
  expect(user!.password).not.toBe(password);
});

test("sign-in accepts the correct password", async ({ page, request }) => {
  await resetRateLimits(request);
  const user = { name: "E2E User", email: uniqueEmail(), password: TEST_PASSWORD };

  // Create through the real sign-up UI, then prove sign-in works on its own.
  await createAccount(page, request, user);
  await logOut(page);

  await signIn(page, request, user);
  await expect(page.getByText("Logged in as")).toBeVisible({ timeout: 15_000 });
});

test("sign-in rejects a wrong password with a generic error", async ({ page, request }) => {
  await resetRateLimits(request);
  const user = { name: "E2E User", email: uniqueEmail(), password: TEST_PASSWORD };
  await createAccount(page, request, user);
  await logOut(page);

  const generic = page.getByText("Invalid email or password");
  const rateLimited = page.getByText("Too many attempts. Try again shortly.");
  let sawGeneric = false;
  for (let attempt = 0; attempt < 6 && !sawGeneric; attempt++) {
    // `submitSignInForm` navigates fresh, so the text reflects THIS submission.
    await submitSignInForm(page, user.email, "wrong-password");
    await expect(generic.or(rateLimited)).toBeVisible({ timeout: 15_000 });
    if (await generic.isVisible()) {
      sawGeneric = true;
      break;
    }
    // Other workers can exhaust the shared per-IP signIn bucket, surfacing the
    // limiter message instead of the credential error; reset and retry.
    await resetRateLimits(request);
  }

  expect(sawGeneric).toBe(true);
  expect(new URL(page.url()).pathname).toBe("/sign-in");
});

test("legacy plaintext row is lazily migrated on sign-in", async ({ page, request }) => {
  await resetRateLimits(request);
  const email = uniqueEmail();

  // One intentional direct-DB fixture: legacy pre-hash user, unreachable via the UI
  await testPrisma.user.create({
    data: { email, name: "Legacy User", password: "legacy-plaintext" },
  });

  await signIn(page, request, { email, password: "legacy-plaintext" });
  await expect(page.getByText("Logged in as")).toBeVisible({ timeout: 15_000 });

  const user = await testPrisma.user.findUnique({ where: { email } });
  expect(user!.password).toMatch(/^\$argon2id\$/);
});

test("password with special characters round-trips", async ({ page, request }) => {
  await resetRateLimits(request);
  const user = {
    name: "Special Chars",
    email: uniqueEmail(),
    password: "P@$$w0rd é🎉 & $ymbols",
  };

  await createAccount(page, request, user);
  await expect(page.getByText("Logged in as")).toBeVisible({ timeout: 15_000 });

  await logOut(page);

  await signIn(page, request, user);
  await expect(page.getByText("Logged in as")).toBeVisible({ timeout: 15_000 });
});

test("6th sign-in attempt in a minute is rate limited", async ({ page, request }) => {
  // Worst case (ten rounds, each an 8-request burst plus a settle guard) can outlast the default 30s timeout.
  test.setTimeout(90_000);
  // Other workers reset the whole per-IP budget far more often than a serial loop can
  // spend 5 attempts, so fire 8 concurrent submits (`requestSubmit()` bypasses the
  // button disable) to exhaust one limiter generation regardless of resets; never the retrying `signIn`.
  await resetRateLimits(request);
  const user = { name: "E2E User", email: uniqueEmail(), password: TEST_PASSWORD };
  await createAccount(page, request, user);
  await logOut(page);
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill("wrong-password");

  const LIMIT_MESSAGE = "Too many attempts. Try again shortly.";
  let sawRateLimit = false;
  for (let round = 0; round < 10 && !sawRateLimit; round++) {
    await burstSignInAttempts(page, user.email, 8);
    // Burst is settled; this single submission is the only reply in flight.
    const body = await submitSignInAttempt(page, user.email, "wrong-password");
    sawRateLimit = body.includes(LIMIT_MESSAGE);
  }

  expect(sawRateLimit).toBe(true);
  await expect(page.getByText(LIMIT_MESSAGE)).toBeVisible({ timeout: 15_000 });
});

test("cross-origin POST is rejected", async ({ page, request }) => {
  await resetRateLimits(request);
  const user = { name: "E2E User", email: uniqueEmail(), password: TEST_PASSWORD };
  await createAccount(page, request, user);
  await logOut(page);

  // CSRF middleware trusts `Sec-Fetch-Site` first, so a forged `Origin` is not enough:
  // retarget the POST at 127.0.0.1 so the browser sends `cross-site` and the middleware 403s.
  await page.route("**/_serverFn/**", (route) =>
    route.continue({
      url: route.request().url().replace("//localhost:4173/", "//127.0.0.1:4173/"),
      headers: { ...route.request().headers(), origin: "https://evil.example" },
    }),
  );

  await submitSignInForm(page, user.email, user.password);

  await page.waitForTimeout(2_000);
  expect(new URL(page.url()).pathname).not.toBe("/");
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === SESSION_COOKIE)).toBeUndefined();
});

test("logout clears the session", async ({ page, request }) => {
  await resetRateLimits(request);
  const user = { name: "E2E User", email: uniqueEmail(), password: TEST_PASSWORD };
  await createAccount(page, request, user);

  await page.goto("/");
  await expect(page.getByText("Logged in as")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(user.email).or(page.getByText("E2E User")).first()).toBeVisible();

  await logOut(page);

  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === SESSION_COOKIE)).toBeUndefined();

  // The old cookie no longer grants access.
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("movements require authentication", async ({ browser }) => {
  const context = await browser.newContext(); // fresh, no cookies
  const page = await context.newPage();

  await page.goto("/movements");
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

  await context.close();
});
