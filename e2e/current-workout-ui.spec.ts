import { expect, test } from "./fixtures";
import { testPrisma } from "./helpers/db";

const unique = (base: string) => `${base} ${Date.now()}-${Math.floor(Math.random() * 10_000)}`;

test("summarizes and groups sets by movement", async ({ authed }) => {
  const { page, user } = authed;
  const bench = await testPrisma.movement.create({ data: { name: unique("Bench Press") } });
  const row = await testPrisma.movement.create({ data: { name: unique("Row") } });
  await testPrisma.workout.create({
    data: {
      userId: user.id,
      sets: {
        create: [
          { movement: { connect: { id: bench.id } }, reps: 10, weight: 135 },
          { movement: { connect: { id: bench.id } }, reps: 8, weight: 155 },
          { movement: { connect: { id: row.id } }, reps: 12, weight: 95 },
        ],
      },
    },
  });

  await page.goto("/current-workout");

  const summary = page.getByTestId("workout-summary");
  await expect(summary).toContainText("3");
  await expect(summary).toContainText("2");
  await expect(summary).toContainText("3,730");

  await expect(page.getByRole("heading", { level: 3, name: bench.name })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: row.name })).toBeVisible();
  await expect(page.getByText("10 reps × 135 lbs")).toBeVisible();
  await expect(page.getByText("12 reps × 95 lbs")).toBeVisible();
});

test("stacks the add-set form on mobile without overflow", async ({ authed }) => {
  const { page } = authed;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/current-workout");
  await page.getByRole("button", { name: "Start Workout" }).click();

  await expect(page.getByLabel("Movement")).toBeVisible();
  await expect(page.getByLabel("Weight")).toBeVisible();
  await expect(page.getByPlaceholder("Reps")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
