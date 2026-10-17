import { test, expect } from "@playwright/test";
import { createTestUser, sessionCookieFor } from "./helpers/auth";

test("forged session cookie is accepted", async ({ page }) => {
  const user = await createTestUser();
  await page.context().addCookies(sessionCookieFor(user.id));
  await page.goto("/profile");
  await expect(page).not.toHaveURL(/sign-in/);
});
