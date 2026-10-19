import { expect, test } from "./fixtures";

test("publishes the Paper & Ink tokens and Manrope", async ({ page }) => {
  await page.goto("/sign-in");

  const background = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--color-background").trim(),
  );
  expect(background.toLowerCase()).toBe("#faf7f0");
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain("Manrope");
});

test("applies warm borders and brand-primary controls", async ({ page }) => {
  await page.goto("/sign-in");

  await expect(page.getByLabel("Email")).toHaveCSS("border-color", "rgb(216, 206, 189)");
  await expect(page.getByRole("button", { name: "Sign in" })).toHaveCSS(
    "background-color",
    "rgb(34, 79, 106)",
  );
  await expect(page.locator('[data-slot="card"]')).toHaveCSS(
    "border-top-color",
    "rgb(225, 216, 200)",
  );
});
