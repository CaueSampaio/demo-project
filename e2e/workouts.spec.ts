import { expect, test } from "./fixtures";
import { seedCompletedWorkout, testPrisma } from "./helpers/db";

/** Movements are global (no userId) — unique names avoid cross-test/run collisions. */
const unique = (base: string) => `${base} ${Date.now()}-${Math.floor(Math.random() * 10_000)}`;

/** The app's own long-date format for the current-workout card title. */
const todayLong = () =>
  new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

/** The history page's short-date format (workout picker / per-row delete labels). */
const day = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(d);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

test.describe("Workouts", () => {
  test.describe("create", () => {
    test("should start a new workout from the current workout page", async ({ authed }) => {
      const { page } = authed;

      await page.goto("/current-workout");
      await expect(page.getByText("No active workout. Ready to start?")).toBeVisible();

      await page.getByRole("button", { name: "Start Workout" }).click();

      await expect(page.getByRole("button", { name: "Complete Workout" })).toBeVisible();
      await expect(page.getByLabel("Movement")).toBeVisible();
    });

    test("should show the workout date after starting", async ({ authed }) => {
      const { page } = authed;

      await page.goto("/current-workout");
      await page.getByRole("button", { name: "Start Workout" }).click();

      await expect(page.getByRole("heading", { name: todayLong() })).toBeVisible();
    });
  });

  test.describe("read", () => {
    test("should display the current active workout", async ({ authed }) => {
      const { page, user } = authed;
      const movement = await testPrisma.movement.create({ data: { name: unique("Bench Press") } });
      await testPrisma.workout.create({
        data: {
          userId: user.id,
          sets: {
            create: [{ movement: { connect: { id: movement.id } }, reps: 10, weight: 135 }],
          },
        },
      });

      await page.goto("/current-workout");

      const row = page.getByRole("listitem").filter({ hasText: movement.name });
      await expect(row).toBeVisible();
      await expect(row).toContainText("10 reps × 135 lbs");
    });

    test("should show 'No active workout' when none exists", async ({ authed }) => {
      const { page } = authed;

      await page.goto("/current-workout");

      await expect(page.getByText("No active workout. Ready to start?")).toBeVisible();
      await expect(page.getByRole("button", { name: "Start Workout" })).toBeVisible();
    });

    test("should display completed workouts in workout history", async ({ authed }) => {
      const { page, user } = authed;
      const movementName = unique("Deadlift");
      await seedCompletedWorkout(user.id, {
        daysAgo: 1,
        sets: [{ movementName, weight: 100, reps: 8 }],
      });

      await page.goto("/workout-history");

      // The seeded completed workout is listed as a pickable row, and its
      // details (the movement, its single run, and the set-derived metrics) render.
      await expect(page.getByRole("button", { name: `Select workout ${day(daysAgo(1))}` })).toBeVisible();
      await expect(page.getByRole("paragraph").filter({ hasText: movementName })).toBeVisible();
      await expect(page.getByText(/1st: 100 lbs × 8/)).toBeVisible();
    });
  });

  test.describe("complete", () => {
    test("should mark the current workout as completed", async ({ authed }) => {
      const { page, user } = authed;
      const movement = await testPrisma.movement.create({ data: { name: unique("Bench Press") } });

      await page.goto("/current-workout");
      await page.getByRole("button", { name: "Start Workout" }).click();
      await page.getByLabel("Movement").selectOption({ label: movement.name });
      await page.getByLabel("Weight").fill("135");
      await page.getByPlaceholder("Reps").fill("10");
      await page.getByRole("button", { name: "Add" }).click();
      await expect(page.getByRole("listitem").filter({ hasText: movement.name })).toBeVisible();

      await page.getByRole("button", { name: "Complete Workout" }).click();

      await expect(page.getByText("No active workout. Ready to start?")).toBeVisible();

      // The server-fn round-trip is not awaited by the click, so poll until durable.
      await expect(async () => {
        const completed = await testPrisma.workout.findFirst({
          where: { userId: user.id, completedAt: { not: null } },
        });
        expect(completed).not.toBeNull();
      }).toPass();
    });

    test("should move completed workout to history", async ({ authed }) => {
      const { page } = authed;
      const movement = await testPrisma.movement.create({ data: { name: unique("Bench Press") } });

      await page.goto("/current-workout");
      await page.getByRole("button", { name: "Start Workout" }).click();
      await page.getByLabel("Movement").selectOption({ label: movement.name });
      await page.getByLabel("Weight").fill("135");
      await page.getByPlaceholder("Reps").fill("10");
      await page.getByRole("button", { name: "Add" }).click();
      await expect(page.getByRole("listitem").filter({ hasText: movement.name })).toBeVisible();

      await page.getByRole("button", { name: "Complete Workout" }).click();
      await expect(page.getByText("No active workout. Ready to start?")).toBeVisible();

      await page.goto("/workout-history");
      await expect(page.getByRole("paragraph").filter({ hasText: movement.name })).toBeVisible();
    });
  });

  test.describe("delete", () => {
    test("should delete selected workouts from history", async ({ authed }) => {
      const { page, user } = authed;
      await seedCompletedWorkout(user.id, {
        daysAgo: 1,
        sets: [{ movementName: unique("Deadlift"), weight: 100, reps: 8 }],
      });
      await seedCompletedWorkout(user.id, {
        daysAgo: 2,
        sets: [{ movementName: unique("Squat"), weight: 200, reps: 5 }],
      });

      await page.goto("/workout-history");
      const rows = page.getByRole("button", { name: /Select workout/ });
      await expect(rows).toHaveCount(2);

      await page.getByRole("button", { name: `Delete workout ${day(daysAgo(1))}` }).click();
      await expect(page.getByRole("button", { name: `Select workout ${day(daysAgo(1))}` })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Select workout/ })).toHaveCount(1);

      await page.getByRole("button", { name: `Delete workout ${day(daysAgo(2))}` }).click();

      await expect(page.getByText("No completed workouts yet.")).toBeVisible();
      await expect(page.getByRole("button", { name: /Select workout/ })).toHaveCount(0);

      // The server-fn round-trip is not awaited by the click, so poll until durable.
      await expect(async () => {
        const remaining = await testPrisma.workout.count({
          where: { userId: user.id, completedAt: { not: null } },
        });
        expect(remaining).toBe(0);
      }).toPass();
    });

    test("should allow selecting multiple workouts for deletion", async ({ authed }) => {
      const { page, user } = authed;
      // NOTE: this app exposes one delete control per history row (no
      // multi-select / select-all checkbox), so "selecting multiple workouts
      // for deletion" is exercised as independently deletable rows: each
      // deletion removes exactly the chosen workout and leaves the other.
      await seedCompletedWorkout(user.id, {
        daysAgo: 1,
        sets: [{ movementName: unique("Deadlift"), weight: 100, reps: 8 }],
      });
      await seedCompletedWorkout(user.id, {
        daysAgo: 2,
        sets: [{ movementName: unique("Squat"), weight: 200, reps: 5 }],
      });

      await page.goto("/workout-history");
      await expect(page.getByRole("button", { name: /Select workout/ })).toHaveCount(2);

      await page.getByRole("button", { name: `Delete workout ${day(daysAgo(2))}` }).click();
      await expect(page.getByRole("button", { name: `Select workout ${day(daysAgo(2))}` })).toHaveCount(0);
      await expect(page.getByRole("button", { name: `Select workout ${day(daysAgo(1))}` })).toBeVisible();

      await page.getByRole("button", { name: `Delete workout ${day(daysAgo(1))}` }).click();

      await expect(page.getByText("No completed workouts yet.")).toBeVisible();
      await expect(page.getByRole("button", { name: /Select workout/ })).toHaveCount(0);
    });
  });
});
