import { test, expect } from "@playwright/test";
import { createTestUser, sessionCookieFor, seedCompletedWorkout, testPrisma } from "./helpers/auth";
import { waitForHydration } from "./helpers/hydration";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const day = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(d);

let userId: string;

test.beforeEach(async () => {
  const user = await createTestUser();
  userId = user.id;
});

test.describe("workout-history progress chart", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies(sessionCookieFor(userId));

    // Deterministic history: Alpha Bench and Zulu Squat (alphabetical => Alpha first).
    // W1 (3d): Alpha 135x10, 145x8 (max 145 / reps 18 / volume 2510); Zulu 225x5
    // W2 (2d): Alpha 150x6; Zulu 240x5
    // W3 (1d): Alpha 140x12
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

  test("shows movement and metric selectors with seeded movements", async ({ page }) => {
    await page.goto("/workout-history");
    await waitForHydration(page);

    await expect(page.getByRole("heading", { name: "Workout History" })).toBeVisible();

    await expect(page.getByLabel("Movement")).toHaveValue(/./); // renders as a select
    const movementOptions = await page.getByLabel("Movement").locator("option").allTextContents();
    expect(movementOptions).toContain("Alpha Bench");
    expect(movementOptions).toContain("Zulu Squat");
    // alphabetical => Alpha Bench is the default selection
    await expect(page.getByLabel("Movement")).toHaveValue(
      (await page.getByLabel("Movement").locator("option").filter({ hasText: "Alpha Bench" }).getAttribute("value"))!,
    );

    const metricOptions = await page.getByLabel("Metric").locator("option").allTextContents();
    expect(metricOptions).toEqual(["Max Weight", "Total Reps", "Total Volume"]);
  });

  test("renders one dot per completed workout for the selected movement", async ({ page }) => {
    await page.goto("/workout-history");
    await waitForHydration(page);

    const chart = page.getByRole("img", { name: "Alpha Bench — Max Weight over time" });
    await expect(chart.locator("circle")).toHaveCount(3);

    await page.getByLabel("Movement").selectOption({ label: "Zulu Squat" });
    const zuluChart = page.getByRole("img", { name: "Zulu Squat — Max Weight over time" });
    await expect(zuluChart.locator("circle")).toHaveCount(2);
  });

  test("plots max weight in chronological order", async ({ page }) => {
    await page.goto("/workout-history");
    await waitForHydration(page);

    const chart = page.getByRole("img", { name: "Alpha Bench — Max Weight over time" });
    // data dots get a duplicate in the focus layer that intercepts locator
    // hovers, so move the real mouse to the first (oldest) dot instead
    const first = await chart.locator("circle").first().boundingBox();
    await page.mouse.move(first!.x + first!.width / 2, first!.y + first!.height / 2);
    // first circle = oldest workout (W1): max of 135x10 and 145x8 => 145
    await expect(chart.locator("..")).toHaveText(/145\b/);
  });

  test("plots total volume as sum of weight times reps", async ({ page }) => {
    await page.goto("/workout-history");
    await waitForHydration(page);

    await page.getByLabel("Metric").selectOption({ label: "Total Volume" });
    const chart = page.getByRole("img", { name: "Alpha Bench — Total Volume over time" });
    // focus-layer duplicate intercepts locator hovers; move the mouse instead
    const first = await chart.locator("circle").first().boundingBox();
    await page.mouse.move(first!.x + first!.width / 2, first!.y + first!.height / 2);
    // first circle = W1: 135*10 + 145*8 = 2510 (maxWeight*totalReps would be 2610);
    // the default tooltip groups thousands ("2,510"), hence the optional comma
    await expect(chart.locator("..")).toHaveText(/2,?510\b/);
  });

  test("ignores sets from active workouts", async ({ page }) => {
    // an active (not yet completed) workout with an Alpha Bench set must not
    // leak into the history selectors or the chart
    const active = await testPrisma.workout.create({ data: { userId } });
    const bench = await testPrisma.movement.findFirstOrThrow({ where: { name: "Alpha Bench" } });
    await testPrisma.set.create({
      data: { workoutId: active.id, movementId: bench.id, reps: 5, weight: 999 },
    });

    await page.goto("/workout-history");
    await waitForHydration(page);

    const movementOptions = await page.getByLabel("Movement").locator("option").allTextContents();
    expect(movementOptions).toEqual(["Alpha Bench", "Zulu Squat"]);

    const chart = page.getByRole("img", { name: "Alpha Bench — Max Weight over time" });
    await expect(chart.locator("circle")).toHaveCount(3);
  });

  test("deletes a workout from the list and updates the chart", async ({ page }) => {
    await page.goto("/workout-history");
    await waitForHydration(page);

    await page.getByRole("button", { name: `Delete workout ${day(daysAgo(2))}` }).click();

    const chart = page.getByRole("img", { name: "Alpha Bench — Max Weight over time" });
    await expect(chart.locator("circle")).toHaveCount(2);

    expect(await testPrisma.workout.count({ where: { userId } })).toBe(2);
    expect(
      await testPrisma.set.count({
        where: { movement: { name: "Alpha Bench" }, workout: { userId } },
      }),
    ).toBe(3); // 4 Alpha sets across W1-W3; W2's 150x6 set is gone with its workout
  });
});
