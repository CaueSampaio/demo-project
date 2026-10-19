import { expect, test } from "./fixtures";

test("sign-in exposes a single clear heading", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { level: 1, name: "Sign in to your account" })).toBeVisible();
});

test("create-account has no horizontal overflow on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/create-account");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await expect(page.getByLabel("Name")).toBeVisible();
});

test("logout presents one clear action", async ({ page }) => {
  await page.goto("/logout");
  await expect(page.getByText("Sign out of Better Bookkeeping?")).toBeVisible();
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
});
