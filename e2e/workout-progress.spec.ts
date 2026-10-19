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

/**
 * Reads the exact `completedAt` the database assigned. Seeds and assertions can
 * land on either side of a minute boundary, so locators must use these values
 * rather than recomputing `daysAgo()` at test time.
 */
const completedAtOf = async (workoutId: string): Promise<Date> => {
  const workout = await testPrisma.workout.findUniqueOrThrow({
    where: { id: workoutId },
    select: { completedAt: true },
  });
  return workout.completedAt!;
};

// Seeded W1 (3d), W2 (2d), W3 (1d), in that order, with their real timestamps.
let seededDates: Date[] = [];

test.describe("workout-history details", () => {
  test.beforeEach(async ({ authed }) => {
    const userId = authed.user.id;

    // Deterministic history (Alpha Bench + Zulu Squat, alphabetical => Alpha first):
    // W1 (3d) Alpha 135x10, 145x8 + Zulu 225x5; W2 (2d) Alpha 150x6 + Zulu 240x5;
    // W3 (1d) Alpha 140x12. W1 has two Alpha sets so its chart points can be counted exactly.
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

  test("overview shows the selected workout and volume chart", async ({ authed }) => {
    const { page } = authed;
    const date = seededDates[1]!;
    await page.goto("/workout-history");
    await openWorkout(page, date);

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    const overviewChart = dialog.getByRole("img", { name: `Volume by movement for ${day(date)}` });
    await expect(overviewChart).toBeVisible();
    // The stacked areas themselves must paint, not just the axes.
    await expect(overviewChart.locator("path")).not.toHaveCount(0);
    // The selected date is marked inside the chart (dashed accent rule), not only by the caption.
    await expect(overviewChart.locator('line[stroke="var(--color-accent)"]')).toHaveCount(1);
    await expect(dialog.getByText("Selected workout")).toBeVisible();
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

  test("renders duplicate weight and reps sets without a chart error", async ({ authed }) => {
    const { page, user } = authed;
    const workoutId = await seedCompletedWorkout(user.id, {
      daysAgo: 0.5,
      sets: [
        { movementName: "Alpha Bench", weight: 150, reps: 6 },
        { movementName: "Alpha Bench", weight: 150, reps: 6 },
      ],
    });
    const date = await completedAtOf(workoutId);

    await page.goto("/workout-history");
    await openWorkout(page, date);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("tab", { name: "Alpha Bench" }).click();

    const chart = dialog.getByRole("img", {
      name: `Alpha Bench — weight vs reps (area = volume) on ${day(date)}`,
    });
    await expect(chart).toBeVisible();
    await expect.poll(() => chart.locator("circle").count(), { timeout: 15_000 }).toBe(2);
    await expect(dialog.getByText(/1st: 150 lbs × 6/)).toBeVisible();
    await expect(dialog.getByText(/2nd: 150 lbs × 6/)).toBeVisible();
  });

  test("ignores sets from active workouts", async ({ authed }) => {
    const { page, user } = authed;
    // An active (not yet completed) workout with an Alpha Bench set must not
    // leak into the history cards or the detail dialog.
    const active = await testPrisma.workout.create({ data: { userId: user.id } });
    const bench = await testPrisma.movement.findFirstOrThrow({ where: { name: "Alpha Bench" } });
    await testPrisma.set.create({
      data: { workoutId: active.id, movementId: bench.id, reps: 5, weight: 999 },
    });

    await page.goto("/workout-history");

    // Only the 3 completed workouts have cards.
    await expect(page.getByRole("button", { name: /Check details for workout/ })).toHaveCount(3);

    // W3 still reports its own volume (1,680 = 140 × 12), not the active 999 set.
    await openWorkout(page, seededDates[2]!);
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("1,680").first()).toBeVisible();
    await dialog.getByRole("tab", { name: "Alpha Bench" }).click();
    await expect(dialog.getByText(/1st: 140 lbs × 12/)).toBeVisible();
    await expect(dialog.getByText(/999/)).toHaveCount(0);
  });

  test("deletes a workout from the list and updates the cards", async ({ authed }) => {
    const { page, user } = authed;
    const date = seededDates[1]!;
    await page.goto("/workout-history");

    // Open W2 in the dialog, close it, then delete it from its card action.
    await openWorkout(page, date);
    await expect(page.getByRole("dialog")).toContainText("Alpha Bench");
    await page.getByRole("button", { name: "Close dialog" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    await page.getByRole("button", { name: `Delete workout ${day(date)} at ${time(date)}` }).click();

    // The deleted card is gone and no set list can show its 150 lb sets.
    await expect(page.getByRole("button", { name: /Check details for workout/ })).toHaveCount(2);
    await expect(page.getByText(/150\s+lbs/)).toHaveCount(0);

    expect(await testPrisma.workout.count({ where: { userId: user.id } })).toBe(2);
    expect(
      await testPrisma.set.count({
        where: { movement: { name: "Alpha Bench" }, workout: { userId: user.id } },
      }),
    ).toBe(3); // W1 (135x10, 145x8) + W3 (140x12); W2's two 150x6 sets went with it
  });
});

test("keeps top five movements plus Other", async ({ authed }) => {
  const { page, user } = authed;
  await seedCompletedWorkout(user.id, {
    daysAgo: 5,
    sets: [{ movementName: "Series 0", weight: 10, reps: 10 }],
  });
  const recentId = await seedCompletedWorkout(user.id, {
    daysAgo: 1,
    sets: Array.from({ length: 7 }, (_, i) => ({
      movementName: `Series ${i}`,
      weight: (7 - i) * 10,
      reps: 10,
    })),
  });
  const date = await completedAtOf(recentId);
  await page.goto("/workout-history");
  await openWorkout(page, date);

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Other")).toBeVisible();
  await expect(dialog.getByRole("tab")).toHaveCount(8); // Overview + 7 movements
});

test("explains when there is not enough history for a trend", async ({ authed }) => {
  const { page, user } = authed;
  const workoutId = await seedCompletedWorkout(user.id, {
    daysAgo: 1,
    sets: [{ movementName: "Only Bench", weight: 135, reps: 10 }],
  });
  const date = await completedAtOf(workoutId);

  await page.goto("/workout-history");
  await openWorkout(page, date);

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Not enough history for a trend yet.")).toBeVisible();
});
