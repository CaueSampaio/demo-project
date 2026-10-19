import { expect, test } from "./fixtures";
import { seedCompletedWorkout } from "./helpers/db";

async function seedLongHistory(userId: string) {
  for (let i = 1; i <= 12; i++) {
    await seedCompletedWorkout(userId, {
      daysAgo: i,
      sets: [{ movementName: `Shell Movement ${i}`, weight: 100, reps: 8 }],
    });
  }
}

test.describe("desktop shell", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("keeps the sidebar fixed and scrolls only the main region", async ({ authed }) => {
    await seedLongHistory(authed.user.id);
    await authed.page.goto("/workout-history");

    await expect(authed.page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    await expect(authed.page.getByRole("navigation", { name: "Mobile" })).toBeHidden();

    const main = authed.page.getByRole("main");
    expect(await main.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    await main.evaluate((el) => {
      el.scrollTop = 240;
    });
    expect(await main.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  });
});

test.describe("mobile shell", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("exposes the skip link and a visible keyboard focus ring", async ({ authed }) => {
    await authed.page.goto("/current-workout");
    await authed.page.keyboard.press("Tab");
    await expect(authed.page.getByRole("link", { name: "Skip to main content" })).toBeFocused();

    const profile = authed.page.getByRole("banner").getByRole("link", { name: "Profile" });
    for (let i = 0; i < 5; i++) {
      await authed.page.keyboard.press("Tab");
      if (await profile.evaluate((el) => el === document.activeElement)) break;
    }
    await expect(profile).toBeFocused();
    expect(await profile.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe("none");
  });

  test("shows bottom tabs, hides the sidebar, and avoids horizontal overflow", async ({ authed }) => {
    await seedLongHistory(authed.user.id);
    await authed.page.goto("/current-workout");

    await expect(authed.page.getByRole("navigation", { name: "Primary" })).toBeHidden();
    await expect(authed.page.getByRole("navigation", { name: "Mobile" })).toBeVisible();
    expect(await authed.page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);

    await authed.page
      .getByRole("navigation", { name: "Mobile" })
      .getByRole("link", { name: "Workout History" })
      .click();
    await expect(authed.page).toHaveURL(/\/workout-history$/);
    // Client-side navigation updates the URL before the destination renders;
    // wait for its content so the scroll container has its final height.
    await expect(authed.page.getByRole("heading", { name: "Workout History", level: 1 })).toBeVisible();

    const main = authed.page.getByRole("main");
    await main.evaluate((el) => {
      el.scrollTop = 240;
    });
    expect(await main.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  });
});
