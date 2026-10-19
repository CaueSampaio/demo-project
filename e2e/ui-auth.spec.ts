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

test("logout actions stay reachable on a short viewport", async ({ page }) => {
  // Short enough that the centred card overflows even with its compact layout.
  await page.setViewportSize({ width: 1024, height: 200 });
  await page.goto("/logout");
  // Scroll like a user would: the page must own a scroll container, not rely on
  // programmatic scrolling that bypasses `overflow: hidden` on <body>.
  await page.mouse.move(512, 100);
  await page.mouse.wheel(0, 2000);
  const box = await page.getByRole("button", { name: "Log out" }).boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
});
