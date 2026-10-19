import { expect, test } from "./fixtures";
import { seedWeights } from "./helpers/db";

test.describe("authed profile page", () => {
  test(`navigates via "Profile" nav item to a titled page`, async ({ authed }) => {
    const { page } = authed;
    await page.goto("/current-workout"); // any authed page
    await page.getByRole("link", { name: "Profile" }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  });

  test(`shows the empty weight section before any entry`, async ({ authed }) => {
    const { page } = authed;
    await page.goto("/profile");
    await expect(page.getByText("Weight Tracking")).toBeVisible();
    await expect(page.getByText(/no weight entries/i)).toBeVisible();
  });

  test("shows account and weight summary", async ({ authed }) => {
    const { page, user } = authed;
    await seedWeights(user.id, [
      { daysAgo: 30, weightLbs: 185 },
      { daysAgo: 1, weightLbs: 183 },
    ]);

    await page.goto("/profile");

    await expect(page.getByRole("heading", { level: 1, name: "Profile" })).toBeVisible();
    const account = page.getByTestId("account-card");
    await expect(account.getByText("E2E User")).toBeVisible();
    await expect(account.getByText(user.email)).toBeVisible();
    await expect(account.getByRole("link", { name: "Log out" })).toBeVisible();

    const summary = page.getByTestId("weight-summary");
    await expect(summary).toContainText("183");
    await expect(summary).toContainText("-2");
    await expect(summary).toContainText("2");
  });

  test(`adds 184 lbs and lists it`, async ({ authed }) => {
    const { page } = authed;
    await page.goto("/profile");
    await page.getByLabel("Weight").fill("184");
    await page.getByRole("button", { name: /add/i }).click();
    await expect(page.getByTestId("weight-entry").filter({ hasText: "184 lbs" })).toBeVisible();
  });

  test(`blocks decimal, zero and out-of-range input`, async ({ authed }) => {
    const { page } = authed;
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

  test(`deletes an entry`, async ({ authed }) => {
    const { page } = authed;
    await page.goto("/profile");
    await page.getByLabel("Weight").fill("190");
    await page.getByRole("button", { name: /add/i }).click();
    await page.getByTestId("weight-entry").filter({ hasText: "190 lbs" }).waitFor();
    await page
      .getByRole("button", { name: /delete/i })
      .first()
      .click();
    await expect(page.getByTestId("weight-entry").filter({ hasText: "190 lbs" })).not.toBeVisible();
  });

  test(`renders the weight-over-time chart after adding an entry`, async ({ authed }) => {
    const { page } = authed;
    await page.goto("/profile");
    await page.getByLabel("Weight").fill("184");
    await page.getByRole("button", { name: /add/i }).click();
    await page.getByTestId("weight-entry").filter({ hasText: "184 lbs" }).waitFor();
    await expect(page.locator(`svg[aria-label="Weight over time"]`)).toBeVisible();
  });

  test(`lists entries ascending after adds`, async ({ authed }) => {
    const { page, user } = authed;
    await seedWeights(user.id, [
      { daysAgo: 7, weightLbs: 185 },
      { daysAgo: 1, weightLbs: 183 },
    ]);
    await page.goto("/profile");
    // Both attributes sit on the same row element.
    const stamps = await page
      .locator(`[data-testid="weight-entry"][data-recorded-at]`)
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-recorded-at")));
    expect(new Date(stamps[0]!) < new Date(stamps[1]!)).toBe(true); // first row is oldest
  });

  test(`same-day weigh-ins both listed and charted`, async ({ authed }) => {
    const { page, user } = authed;
    await seedWeights(user.id, [
      { daysAgo: 0, weightLbs: 184 },
      { daysAgo: 0, weightLbs: 186 },
    ]);
    await page.goto("/profile");
    await expect(page.getByTestId("weight-entry").filter({ hasText: "184 lbs" })).toBeVisible();
    await expect(page.getByTestId("weight-entry").filter({ hasText: "186 lbs" })).toBeVisible();
    await expect(page.locator(`svg[aria-label="Weight over time"]`)).toBeVisible();
  });

  test(`months-apart data still renders a legible chart`, async ({ authed }) => {
    const { page, user } = authed;
    await seedWeights(user.id, [
      { daysAgo: 400, weightLbs: 200 },
      { daysAgo: 30, weightLbs: 190 },
      { daysAgo: 2, weightLbs: 185 },
    ]);
    await page.goto("/profile");
    await expect(page.getByTestId("weight-entry").filter({ hasText: "185 lbs" })).toBeVisible();
    await expect(page.locator(`svg[aria-label="Weight over time"]`)).toBeVisible();
  });
});
