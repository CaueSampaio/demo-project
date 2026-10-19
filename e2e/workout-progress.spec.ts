import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { seedCompletedWorkout, testPrisma } from "./helpers/db";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const day = (d: Date) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
const time = (d: Date) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(d);

const openWorkout = async (page: Page, date: Date) => {
  await page.getByRole("button", { name: `Check details for workout ${day(date)} at ${time(date)}` }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
};

// Reads the exact completedAt so locators cannot race a minute boundary.
const completedAtOf = async (workoutId: string): Promise<Date> => {
  const workout = await testPrisma.workout.findUniqueOrThrow({
    where: { id: workoutId },
    select: { completedAt: true },
  });
  return workout.completedAt!;
};

// Seeded workout timestamps, captured after beforeEach runs.
let seededDates: Date[] = [];

test.describe("workout-history details", () => {
  test.beforeEach(async ({ authed }) => {
    const userId = authed.user.id;

    // W1: Alpha 135x10/145x8 + Zulu 225x5; W2: Alpha 150x6 + Zulu 240x5; W3: Alpha 140x12.
    const w1 = await seedCompletedWorkout(userId, {
      daysAgo: 3,
      sets: [
        { movementName: "Alpha Bench", weight: 135, reps: 10 },
        { movementName: "Alpha Bench", weight: 145, reps: 8 },
        { movementName: "Zulu Squat", weight: 225, reps: 5 },
      ],
    });
    const w2 = await seedCompletedWorkout(userId, {
      daysAgo: 2,
      sets: [
        { movementName: "Alpha Bench", weight: 150, reps: 6 },
        { movementName: "Zulu Squat", weight: 240, reps: 5 },
      ],
    });
    const w3 = await seedCompletedWorkout(userId, {
      daysAgo: 1,
      sets: [{ movementName: "Alpha Bench", weight: 140, reps: 12 }],
    });

    seededDates = [await completedAtOf(w1), await completedAtOf(w2), await completedAtOf(w3)];
  });

  test("overview breaks the selected workout volume down by movement", async ({ authed }) => {
    const { page } = authed;
    const date = seededDates[1]!;
    await page.goto("/workout-history");
    await openWorkout(page, date);

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    const breakdown = dialog.getByRole("region", { name: `Volume by movement for ${day(date)}` });
    await expect(breakdown).toBeVisible();

    // Sorted by volume: Zulu Squat 1,200 > Alpha Bench 900.
    const rows = breakdown.getByRole("listitem");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Zulu Squat");
    await expect(rows.nth(0)).toContainText("1,200 lbs");
    await expect(rows.nth(1)).toContainText("Alpha Bench");
    await expect(rows.nth(1)).toContainText("900 lbs");

    const bars = breakdown.getByRole("progressbar");
    await expect(bars).toHaveCount(2);
    await expect(bars.nth(0)).toHaveAttribute("aria-valuenow", "1200");
    await expect(bars.nth(1)).toHaveAttribute("aria-valuenow", "900");

    await expect(dialog.getByRole("tab", { name: "Alpha Bench" })).toBeVisible();
    await expect(dialog.getByRole("tab", { name: "Zulu Squat" })).toBeVisible();
  });

  test("movement tabs show weight on x, reps on y, and sets", async ({ authed }) => {
    const { page } = authed;
    const date = seededDates[0]!;
    await page.goto("/workout-history");
    await openWorkout(page, date);

    const dialog = page.getByRole("dialog");
    await dialog.getByRole("tab", { name: "Alpha Bench" }).click();
    const chart = dialog.getByRole("img", {
      name: `Alpha Bench — weight vs reps (area = volume) on ${day(date)}`,
    });
    await expect(chart).toBeVisible();
    await expect.poll(() => chart.locator("circle").count(), { timeout: 15_000 }).toBe(2);
    await expect(dialog.getByText(/145\s+lbs/).first()).toBeVisible();
    await expect(dialog.getByText("18", { exact: true })).toBeVisible();
    await expect(dialog.getByText(/2,510/).first()).toBeVisible();
    await expect(dialog.getByText(/1st: 135 lbs × 10/)).toBeVisible();
    await expect(dialog.getByText(/2nd: 145 lbs × 8/)).toBeVisible();
  });

  test("deletes a workout from the list and updates the cards", async ({ authed }) => {
    const { page, user } = authed;
    const date = seededDates[1]!;
    await page.goto("/workout-history");

    // Open W2, close the dialog, then delete its card.
    await openWorkout(page, date);
    await expect(page.getByRole("dialog")).toContainText("Alpha Bench");
    await page.getByRole("button", { name: "Close dialog" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    await page.getByRole("button", { name: `Delete workout ${day(date)} at ${time(date)}` }).click();

    // W2's card and 150 lb sets are gone.
    await expect(page.getByRole("button", { name: /Check details for workout/ })).toHaveCount(2);
    await expect(page.getByText(/150\s+lbs/)).toHaveCount(0);

    expect(await testPrisma.workout.count({ where: { userId: user.id } })).toBe(2);
    expect(
      await testPrisma.set.count({
        where: { movement: { name: "Alpha Bench" }, workout: { userId: user.id } },
      }),
    ).toBe(3); // W1 has two Alpha sets; W3 has one.
  });
});
