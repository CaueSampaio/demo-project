import { expect, test } from "./fixtures";
import { testPrisma } from "./helpers/db";

/** Movements are global (no userId) — unique names avoid cross-test/run collisions. */
const unique = (base: string) => `${base} ${Date.now()}-${Math.floor(Math.random() * 10_000)}`;

test.describe("Sets", () => {
  test.describe("create", () => {
    test("should add a set to the current workout", async ({ authed }) => {
      const { page, user } = authed;
      const movement = await testPrisma.movement.create({ data: { name: unique("Bench Press") } });
      await testPrisma.workout.create({ data: { userId: user.id } });

      await page.goto("/current-workout");
      await page.getByLabel("Movement").selectOption({ label: movement.name });
      await page.getByLabel("Weight").fill("135");
      await page.getByPlaceholder("Reps").fill("10");
      await page.getByRole("button", { name: "Add" }).click();

      await expect(page.getByRole("listitem").filter({ hasText: movement.name })).toContainText("10 reps × 135 lbs");

      // The server-fn round-trip is not awaited by the click, so poll until durable.
      await expect(async () => {
        const set = await testPrisma.set.findFirst({
          where: { movement: { name: movement.name }, workout: { userId: user.id } },
        });
        expect(set?.weight).toBe(135);
      }).toPass();
    });

    test("should require movement, weight, and reps to add a set", async ({ authed }) => {
      const { page } = authed;
      const movement = await testPrisma.movement.create({ data: { name: unique("Bench Press") } });

      await page.goto("/current-workout");
      await page.getByRole("button", { name: "Start Workout" }).click();

      const add = page.getByRole("button", { name: "Add" });
      await expect(page.getByLabel("Movement")).toBeVisible();
      await expect(add).toBeDisabled();

      await page.getByLabel("Movement").selectOption({ label: movement.name });
      await expect(add).toBeDisabled();

      await page.getByPlaceholder("Reps").fill("10");
      await expect(add).toBeDisabled();

      await page.getByLabel("Weight").fill("135");
      await expect(add).toBeEnabled();
    });

    test("should display the new set in the workout", async ({ authed }) => {
      const { page, user } = authed;
      const movement = await testPrisma.movement.create({ data: { name: unique("Bench Press") } });
      await testPrisma.workout.create({ data: { userId: user.id } });

      await page.goto("/current-workout");
      await page.getByLabel("Movement").selectOption({ label: movement.name });
      await page.getByLabel("Weight").fill("135");
      await page.getByPlaceholder("Reps").fill("10");
      await page.getByRole("button", { name: "Add" }).click();

      await expect(page.getByRole("listitem").filter({ hasText: movement.name })).toContainText("10 reps × 135 lbs");
    });
  });

  test.describe("read", () => {
    test("should display sets with movement name, weight, and reps", async ({ authed }) => {
      const { page, user } = authed;
      const movement = await testPrisma.movement.create({ data: { name: unique("Bench Press") } });
      await testPrisma.workout.create({
        data: {
          userId: user.id,
          sets: {
            create: [
              { movement: { connect: { id: movement.id } }, reps: 10, weight: 135 },
              { movement: { connect: { id: movement.id } }, reps: 8, weight: 155 },
            ],
          },
        },
      });

      await page.goto("/current-workout");
      const rows = page.getByRole("listitem");
      await expect(rows).toHaveCount(2);
      // Both rows share the movement; sets now order by `createdAt` asc, so distinguish by content.
      await expect(rows.filter({ hasText: "10 reps × 135 lbs" })).toContainText(movement.name);
      await expect(rows.filter({ hasText: "8 reps × 155 lbs" })).toContainText(movement.name);
    });

    test("should show sets in the order they were added", async ({ authed }) => {
      const { page, user } = authed;
      const movement = await testPrisma.movement.create({ data: { name: unique("Bench Press") } });
      await testPrisma.workout.create({ data: { userId: user.id } });

      await page.goto("/current-workout");
      await page.getByLabel("Movement").selectOption({ label: movement.name });
      await page.getByLabel("Weight").fill("135");
      await page.getByPlaceholder("Reps").fill("10");
      await page.getByRole("button", { name: "Add" }).click();
      await expect(page.getByRole("listitem").filter({ hasText: "10 reps" })).toBeVisible();

      // The movement stays selected after adding, so only reps need refilling.
      await page.getByPlaceholder("Reps").fill("6");
      await page.getByRole("button", { name: "Add" }).click();

      const rows = page.getByRole("listitem");
      await expect(rows).toHaveCount(2);
      await expect(rows.nth(0)).toContainText("10 reps");
      await expect(rows.nth(1)).toContainText("6 reps");
    });
  });

  test.describe("delete", () => {
    test("should remove a set from the current workout", async ({ authed }) => {
      const { page, user } = authed;
      const first = await testPrisma.movement.create({ data: { name: unique("Bench Press") } });
      const second = await testPrisma.movement.create({ data: { name: unique("Squat") } });
      await testPrisma.workout.create({
        data: {
          userId: user.id,
          sets: {
            create: [
              { movement: { connect: { id: first.id } }, reps: 10, weight: 135 },
              { movement: { connect: { id: second.id } }, reps: 8, weight: 155 },
            ],
          },
        },
      });

      await page.goto("/current-workout");
      const row = page.getByRole("listitem").filter({ hasText: first.name });
      await expect(row).toBeVisible();

      await row.getByRole("button").click();

      await expect(row).toHaveCount(0);
      await expect(page.getByRole("listitem").filter({ hasText: second.name })).toBeVisible();
    });

    test("should update the sets list after deletion", async ({ authed }) => {
      const { page, user } = authed;
      const first = await testPrisma.movement.create({ data: { name: unique("Bench Press") } });
      const second = await testPrisma.movement.create({ data: { name: unique("Squat") } });
      await testPrisma.workout.create({
        data: {
          userId: user.id,
          sets: {
            create: [
              { movement: { connect: { id: first.id } }, reps: 10, weight: 135 },
              { movement: { connect: { id: second.id } }, reps: 8, weight: 155 },
            ],
          },
        },
      });

      await page.goto("/current-workout");
      const rows = page.getByRole("listitem");
      await expect(rows).toHaveCount(2);

      await rows.filter({ hasText: first.name }).getByRole("button").click();

      await expect(rows).toHaveCount(1);
      await expect(rows.filter({ hasText: second.name })).toBeVisible();
    });
  });
});
