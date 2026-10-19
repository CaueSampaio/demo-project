import { type Locator } from "@playwright/test";
import { expect, test } from "./fixtures";
import { seedCompletedWorkout, testPrisma } from "./helpers/db";

/**
 * Chart dots paint client-side after the container is measured, so poll for the
 * circle count (past the 5s default) rather than trusting an instantaneous count.
 */
async function expectCircles(chart: Locator, count: number): Promise<void> {
  await expect(chart).toBeVisible();
  await expect.poll(() => chart.locator("circle").count(), { timeout: 15_000 }).toBe(count);
}

test.describe("movement all-time progress page", () => {
  test.beforeEach(async ({ authed }) => {
    const userId = authed.user.id;

    // Same deterministic Alpha Bench data as workout-progress.spec.ts: W1 (3d), W2 (2d), W3 (1d).
    await seedCompletedWorkout(userId, {
      daysAgo: 3,
      sets: [
        { movementName: "Alpha Bench", weight: 135, reps: 10 },
        { movementName: "Alpha Bench", weight: 145, reps: 8 },
      ],
    });
    await seedCompletedWorkout(userId, {
      daysAgo: 2,
      sets: [{ movementName: "Alpha Bench", weight: 150, reps: 6 }],
    });
    await seedCompletedWorkout(userId, {
      daysAgo: 1,
      sets: [{ movementName: "Alpha Bench", weight: 140, reps: 12 }],
    });
  });

  test("navigates from the movements list to an all-time chart via URL param", async ({ authed }) => {
    const { page, user } = authed;
    await page.goto("/movements");

    await expect(page.getByRole("heading", { name: "Movements", exact: true })).toBeVisible();

    // Global non-unique names: resolve the id this user's sets actually reference.
    const userSet = await testPrisma.set.findFirstOrThrow({
      where: { movement: { name: "Alpha Bench" }, workout: { userId: user.id } },
      include: { movement: true },
    });
    await page.locator(`a[href$="/movements/${userSet.movementId}"]`).click();

    await expect(page).toHaveURL(/\/movements\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Alpha Bench" })).toBeVisible();

    const chart = page.getByRole("img", { name: "Alpha Bench — Max Weight over time" });
    await expectCircles(chart, 3);
  });

  test("switches metrics on the movement page", async ({ authed }) => {
    const { page, user } = authed;
    const userSet = await testPrisma.set.findFirstOrThrow({
      where: { movement: { name: "Alpha Bench" }, workout: { userId: user.id } },
      include: { movement: true },
    });
    await page.goto(`/movements/${userSet.movementId}`);

    await page.getByLabel("Metric").selectOption({ label: "Total Reps" });

    const chart = page.getByRole("img", { name: "Alpha Bench — Total Reps over time" });
    await expectCircles(chart, 3);

    // focus-layer duplicate intercepts locator hovers; move the mouse instead
    const first = await chart.locator("circle").first().boundingBox();
    await page.mouse.move(first!.x + first!.width / 2, first!.y + first!.height / 2);
    // first circle = oldest workout: 10 + 8 = 18 total reps
    await expect(chart.locator("..")).toHaveText(/18\b/);
  });

  test("renders a bodyweight movement", async ({ authed }) => {
    const { page, user } = authed;
    const workoutId = await seedCompletedWorkout(user.id, {
      daysAgo: 1,
      sets: [{ movementName: { name: "Body Dip", isBodyweight: true }, weight: 0, reps: 15 }],
    });
    const dipSet = await testPrisma.set.findFirstOrThrow({
      where: { workoutId },
      include: { movement: true },
    });

    await page.goto(`/movements/${dipSet.movementId}`);

    await expect(page.getByRole("heading", { name: "Body Dip" })).toBeVisible();
    const chart = page.getByRole("img", { name: "Body Dip — Max Weight over time" });
    await expectCircles(chart, 1);
  });

  test("shows all-time summary stats", async ({ authed }) => {
    const { page, user } = authed;
    const userSet = await testPrisma.set.findFirstOrThrow({
      where: { movement: { name: "Alpha Bench" }, workout: { userId: user.id } },
      include: { movement: true },
    });

    await page.goto(`/movements/${userSet.movementId}`);

    const stats = page.getByTestId("movement-stats");
    await expect(stats).toContainText("150");
    await expect(stats).toContainText("36");
    await expect(stats).toContainText("5,090");
    await expect(stats).toContainText("3");
  });

  test("shows the empty state for an unused movement", async ({ authed }) => {
    const { page } = authed;
    const movement = await testPrisma.movement.create({
      data: { name: "Unused Fly", isBodyweight: false },
    });

    await page.goto(`/movements/${movement.id}`);

    await expect(page.getByText("No completed workouts yet.")).toBeVisible();
    // No chart is rendered; the layout's logo/devtools imgs still exist.
    await expect(page.getByRole("img", { name: /over time/ })).toHaveCount(0);
  });
});
