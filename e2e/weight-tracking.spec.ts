import { test, expect } from "@playwright/test";
import { createTestUser, sessionCookieFor } from "./helpers/auth";

test("forged session cookie is accepted", async ({ page }) => {
  const user = await createTestUser();
  await page.context().addCookies(sessionCookieFor(user.id));
  await page.goto("/profile");
  await expect(page).not.toHaveURL(/sign-in/);
});

test.describe("authed profile page", () => {
  test.beforeEach(async ({ page }) => {
    const user = await createTestUser();
    await page.context().addCookies(sessionCookieFor(user.id));
  });

  test(`navigates via "Profile" nav item to a titled page`, async ({ page }) => {
    await page.goto("/current-workout"); // any authed page
    await page.getByRole("link", { name: "Profile" }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  });

  test(`shows the empty weight section before any entry`, async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByText("Weight Tracking")).toBeVisible();
    await expect(page.getByText(/no weight entries/i)).toBeVisible();
  });
});
