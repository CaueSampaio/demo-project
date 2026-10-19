import crypto from "node:crypto";
import { type APIRequestContext, type Page, test as base, expect } from "@playwright/test";
import { testPrisma } from "./helpers/db";

export { expect };

const TEST_PASSWORD = "e2test-password";

/** Fresh sign-up email; the `test.local` domain keeps test data out of real inboxes. */
export function uniqueEmail(): string {
  return `e2e-${crypto.randomUUID()}@test.local`;
}

export type TestUser = {
  name: string;
  email: string;
  password: string;
  id: string;
};

export type AuthedContext = {
  page: Page;
  user: TestUser;
};

/**
 * Clears the in-memory per-IP rate-limit buckets. The file-route endpoint needs an
 * explicit same-origin Origin header; APIRequestContext sends none.
 */
export async function resetRateLimits(request: APIRequestContext): Promise<void> {
  const response = await request.post("/api/dev-reset-rate-limits", {
    headers: { origin: "http://localhost:4173" },
  });
  expect(response.status()).toBe(200);
}

/**
 * Auth attempts per call. The 3/min per-IP create-account budget is shared by
 * `fullyParallel` workers, so 8 retry rounds cover up to ~24 workers.
 */
const MAX_AUTH_ATTEMPTS = 8;

/**
 * Submits an auth form and settles on the signed-in app, resetting the limiters
 * and retrying on a per-IP "Too many attempts" rejection.
 */
async function submitAuth(
  page: Page,
  request: APIRequestContext,
  authPath: string,
  submit: () => Promise<void>,
): Promise<void> {
  for (let attempt = 0; attempt < MAX_AUTH_ATTEMPTS; attempt++) {
    await page.goto(authPath);
    await submit();

    // The account footer is desktop-only; below `lg` the mobile tab bar is the
    // signed-in marker living in the shell.
    const signedIn = page
      .getByText("Logged in as")
      .filter({ visible: true })
      .or(page.getByRole("navigation", { name: "Mobile" }));
    const rateLimited = page.getByText("Too many attempts");
    await expect(signedIn.or(rateLimited)).toBeVisible({ timeout: 15_000 });
    if (await signedIn.isVisible()) {
      expect(new URL(page.url()).pathname).not.toBe(authPath);
      return;
    }

    await resetRateLimits(request);
  }

  await expect(page.getByText("Logged in as")).toBeVisible({ timeout: 15_000 });
}

/** Creates an account through the real sign-up UI and lands signed in. */
export async function createAccount(
  page: Page,
  request: APIRequestContext,
  user: { name: string; email: string; password: string },
): Promise<void> {
  await submitAuth(page, request, "/create-account", async () => {
    await page.getByLabel("Name").fill(user.name);
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill(user.password);
    await page.getByRole("button", { name: "Create account" }).click();
  });
}

/** Signs in through the real sign-in UI and lands signed in. */
export async function signIn(
  page: Page,
  request: APIRequestContext,
  user: { email: string; password: string },
): Promise<void> {
  await submitAuth(page, request, "/sign-in", async () => {
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill(user.password);
    await page.getByRole("button", { name: "Sign in" }).click();
  });
}

/**
 * `test` with an `authed` fixture: a unique account via the UI, resolving the
 * new row's id so tests can seed per-user data directly.
 */
export const test = base.extend<{ authed: AuthedContext }>({
  authed: async ({ page, request }, use) => {
    await resetRateLimits(request);
    const user = { name: "E2E User", email: uniqueEmail(), password: TEST_PASSWORD };
    await createAccount(page, request, user);
    const created = await testPrisma.user.findUniqueOrThrow({ where: { email: user.email } });
    await use({ page, user: { ...user, id: created.id } });
  },
});
