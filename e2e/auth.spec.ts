import { type Page, type Response } from "@playwright/test";
import { createAccount, expect, resetRateLimits, signIn, test, uniqueEmail } from "./fixtures";
import { testPrisma } from "./helpers/db";

const SESSION_COOKIE = "session";

// Matches TEST_PASSWORD in ./fixtures; spelled out here so the literal the
// sign-up flow stores is explicit in the assertions below.
const TEST_PASSWORD = "e2test-password";

/**
 * Submits the sign-in form WITHOUT the success-oriented retry of `signIn`.
 * Negative-path tests (wrong password, rate limit, forged cross-origin POST)
 * must observe the form's failure response, so they cannot use `signIn`, which
 * polls until the signed-in app appears.
 */
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

/**
 * Submits the sign-in form on the ALREADY-LOADED page and resolves the reply
 * body once the sign-in server function responds. Used for the single
 * confirming attempt in the rate-limit test; negative-path tests that need a
 * fresh page use `submitSignInForm` instead.
 */
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
 * Fires `count` concurrent sign-in submissions through the form's own submit
 * handler on the already-loaded page. The button self-disables while a request
 * is in flight (serializing ordinary clicks); `requestSubmit()` bypasses that
 * and exercises the real sign-in server function concurrently. Resolves only
 * after every reply has come back, so the caller observes a settled limiter.
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

  // Create through the real sign-up UI, then prove sign-in works on its own by
  // ending the session and signing back in.
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
    // Concurrent workers can spend the shared per-IP signIn bucket (e.g. the
    // rate-limit test), surfacing the limiter message instead of the credential
    // error. Free the buckets and retry so the asserted path is still exercised.
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
  // The signIn bucket is 5/min per IP, but the dev reset endpoint frees the
  // WHOLE per-IP budget and, under `fullyParallel`, other workers reset the
  // limiter far more often than a serial UI loop can spend 5 attempts (~400ms of
  // argon2 verification each). Semantics are unchanged — spending more than
  // signIn.limit attempts within one minute must surface "Too many attempts" —
  // but a naive serial loop can lose the reset race indefinitely.
  //
  // So drive the form's own submit handler in a genuine CONCURRENT burst: the
  // button self-disables while a request is in flight (which would serialize the
  // attempts), while `form.requestSubmit()` bypasses that and fires several real
  // sign-in server-fn calls at once. Eight concurrent consumes exhaust the
  // 5-point bucket within one limiter generation, so at least one reply carries
  // the limiter message regardless of resets. The loop then stops and confirms
  // the message reaches the user via one normal submission with nothing else in
  // flight (the just-exhausted limiter rejects it instantly). Do NOT use the
  // auto-retrying `signIn` helper here: it would retry the expected rejection.
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
    // The burst is fully settled now; a single confirming submission is the
    // only reply in flight, so its message is what the UI renders.
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
      url: route.request().url().replace("//localhost:4173/", "//127.0.0.1:4173/"),
      headers: { ...route.request().headers(), origin: "https://evil.example" },
    }),
  );

  await submitSignInForm(page, user.email, user.password);

  // Should not land in the app and no session cookie may be set.
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
