import { expect, test } from "./fixtures";
import { seedCompletedWorkout, testPrisma } from "./helpers/db";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const day = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(d);

test.describe("workout-history details", () => {
  test.beforeEach(async ({ authed }) => {
    const userId = authed.user.id;

    // Deterministic history (Alpha Bench + Zulu Squat, alphabetical => Alpha first):
    // W1 (3d) Alpha 135x10, 145x8 + Zulu 225x5; W2 (2d) Alpha 150x6 + Zulu 240x5; W3 (1d) Alpha 140x12.
    await seedCompletedWorkout(userId, {
      daysAgo: 3,
      sets: [
        { movementName: "Alpha Bench", weight: 135, reps: 10 },
        { movementName: "Alpha Bench", weight: 145, reps: 8 },
        { movementName: "Zulu Squat", weight: 225, reps: 5 },
      ],
    });
    await seedCompletedWorkout(userId, {
      daysAgo: 2,
      sets: [
        { movementName: "Alpha Bench", weight: 150, reps: 6 },
        { movementName: "Zulu Squat", weight: 240, reps: 5 },
      ],
    });
    await seedCompletedWorkout(userId, {
      daysAgo: 1,
      sets: [{ movementName: "Alpha Bench", weight: 140, reps: 12 }],
    });
  });

  test("selects the most recent workout by default and shows its movements", async ({ authed }) => {
    const { page } = authed;
    await page.goto("/workout-history");

    // The most recent workout (W3) is the only one pressed.
    const mostRecent = page.getByRole("button", { name: `Select workout ${day(daysAgo(1))}` });
    await expect(mostRecent).toHaveAttribute("aria-pressed", "true");
    for (const older of [day(daysAgo(3)), day(daysAgo(2))]) {
      await expect(page.getByRole("button", { name: `Select workout ${older}` })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    }
    await expect(page.locator('[aria-pressed="true"]')).toHaveCount(1);

    // Charts repeat movement names, so scope name assertions to the number-block paragraph.
    await expect(page.getByRole("heading", { name: day(daysAgo(1)) })).toBeVisible();
    await expect(page.getByRole("paragraph").filter({ hasText: "Alpha Bench" })).toBeVisible();
    // Run list and aggregate both contain "140 lbs"; .first() is equivalent.
    await expect(page.getByText(/140\s+lbs/).first()).toBeVisible();
    await expect(page.getByText(/12\s+reps/)).toBeVisible();
    await expect(page.getByText(/1,680/)).toBeVisible();
    await expect(page.getByText(/1st: 140 lbs × 12/)).toBeVisible();

    // One bubble chart per movement (W3 has only Alpha): x = reps, y = weight, area = volume.
    await expect(
      page.getByRole("img", {
        name: `Alpha Bench — weight vs reps (area = volume) on ${day(daysAgo(1))}`,
      }),
    ).toBeVisible();
    await expect(page.getByText(/Area = volume \(weight × reps\)/)).toBeVisible();
  });

  test("shows every movement of the selected workout with its three metrics", async ({ authed }) => {
    const { page } = authed;
    await page.goto("/workout-history");

    await page.getByRole("button", { name: `Select workout ${day(daysAgo(3))}` }).click();

    // W1 contains both movements, each with its three metrics from that workout only.
    await expect(page.getByRole("paragraph").filter({ hasText: "Alpha Bench" })).toBeVisible();
    await expect(page.getByText(/145\s+lbs/).first()).toBeVisible();
    await expect(page.getByText(/18\s+reps/)).toBeVisible();
    await expect(page.getByText(/2,510/)).toBeVisible();

    await expect(page.getByRole("paragraph").filter({ hasText: "Zulu Squat" })).toBeVisible();
    await expect(page.getByText(/225\s+lbs/).first()).toBeVisible();
    await expect(page.getByText(/5\s+reps/)).toBeVisible();
    await expect(page.getByText(/1,125/)).toBeVisible();

    // Each run appears in performed order: Alpha twice (135x10, 145x8), Zulu once.
    await expect(page.getByText(/1st: 135 lbs × 10/)).toBeVisible();
    await expect(page.getByText(/2nd: 145 lbs × 8/)).toBeVisible();
    await expect(page.getByText(/1st: 225 lbs × 5/)).toBeVisible();
  });

  test("switching workout updates the details", async ({ authed }) => {
    const { page } = authed;
    await page.goto("/workout-history");

    // Start from the default (W3), then switch to W2.
    await page.getByRole("button", { name: `Select workout ${day(daysAgo(2))}` }).click();
    await expect(page.getByRole("heading", { name: day(daysAgo(2)) })).toBeVisible();
    await expect(page.getByRole("paragraph").filter({ hasText: "Alpha Bench" })).toBeVisible();
    await expect(page.getByText(/150\s+lbs/).first()).toBeVisible();
    await expect(page.getByText(/6\s+reps/)).toBeVisible();
    // "900 volume" (not a bare /900/: full-width y-axes can show a 900 tick).
    await expect(page.getByText(/900\s+volume/)).toBeVisible();

    await expect(page.getByRole("paragraph").filter({ hasText: "Zulu Squat" })).toBeVisible();
    await expect(page.getByText(/240\s+lbs/).first()).toBeVisible();
    await expect(page.getByText(/1,200/)).toBeVisible();

    // Charts follow the selection: W2's two movement charts replace W3's.
    await expect(
      page.getByRole("img", {
        name: `Alpha Bench — weight vs reps (area = volume) on ${day(daysAgo(2))}`,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", {
        name: `Zulu Squat — weight vs reps (area = volume) on ${day(daysAgo(2))}`,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", {
        name: `Alpha Bench — weight vs reps (area = volume) on ${day(daysAgo(1))}`,
      }),
    ).toHaveCount(0);
  });

  test("ignores sets from active workouts", async ({ authed }) => {
    const { page, user } = authed;
    // An active (not yet completed) workout with an Alpha Bench set must not
    // leak into the workout picker or the details.
    const active = await testPrisma.workout.create({ data: { userId: user.id } });
    const bench = await testPrisma.movement.findFirstOrThrow({ where: { name: "Alpha Bench" } });
    await testPrisma.set.create({
      data: { workoutId: active.id, movementId: bench.id, reps: 5, weight: 999 },
    });

    await page.goto("/workout-history");

    // Picker lists only the 3 completed workout dates.
    await expect(page.getByRole("button", { name: /Select workout/ })).toHaveCount(3);
    // Details still show W3's Alpha numbers (not the active workout's 999 lbs set).
    await expect(page.getByText(/140\s+lbs/).first()).toBeVisible();
    await expect(page.getByText(/999\s+lbs/)).toHaveCount(0);
  });

  test("deletes a workout from the list and updates the details", async ({ authed }) => {
    const { page, user } = authed;
    await page.goto("/workout-history");

    // Select W2 first (not the default), then delete it.
    await page.getByRole("button", { name: `Select workout ${day(daysAgo(2))}` }).click();
    await expect(page.getByText(/150\s+lbs/).first()).toBeVisible();

    await page.getByRole("button", { name: `Delete workout ${day(daysAgo(2))}` }).click();

    // The deleted workout's numbers are gone from the details (guards query invalidation).
    await expect(page.getByText(/150\s+lbs/)).toHaveCount(0);

    // Picker shrank to the 2 remaining workouts; selection fell back to the
    // most recent remaining one (W3).
    await expect(page.getByRole("button", { name: /Select workout/ })).toHaveCount(2);
    await expect(page.getByRole("button", { name: `Select workout ${day(daysAgo(1))}` })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    expect(await testPrisma.workout.count({ where: { userId: user.id } })).toBe(2);
    expect(
      await testPrisma.set.count({
        where: { movement: { name: "Alpha Bench" }, workout: { userId: user.id } },
      }),
    ).toBe(3); // 4 Alpha sets across W1-W3; W2's 150x6 set is gone with its workout
  });
});
