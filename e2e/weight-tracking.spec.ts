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

  test(`adds 184 lbs and lists it`, async ({ page }) => {
    await page.goto("/profile");
    await page.getByLabel("Weight").fill("184");
    await page.getByRole("button", { name: /add/i }).click();
    await expect(page.getByText(/184 lbs/)).toBeVisible();
  });

  test(`blocks decimal, zero and out-of-range input`, async ({ page }) => {
    await page.goto("/profile");
    const weight = page.getByLabel("Weight");
    const add = page.getByRole("button", { name: /add/i });
    await weight.fill("84.5");
    await expect(add).toBeDisabled();
    await weight.fill("0");
    await expect(add).toBeDisabled();
    await weight.fill("2000");
    await expect(add).toBeDisabled();
  });

  test(`deletes an entry`, async ({ page }) => {
    await page.goto("/profile");
    await page.getByLabel("Weight").fill("190");
    await page.getByRole("button", { name: /add/i }).click();
    await page.getByText(/190 lbs/).waitFor();
    await page.getByRole("button", { name: /delete/i }).first().click();
    await expect(page.getByText(/190 lbs/)).not.toBeVisible();
  });

  test(`renders the weight-over-time chart after adding an entry`, async ({ page }) => {
    await page.goto("/profile");
    await page.getByLabel("Weight").fill("184");
    await page.getByRole("button", { name: /add/i }).click();
    await page.getByText(/184 lbs/).waitFor();
    await expect(page.locator(`svg[aria-label="Weight over time"]`)).toBeVisible();
  });
});
