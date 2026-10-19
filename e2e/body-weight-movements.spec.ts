import { expect, test } from "./fixtures";
import { seedWeights, testPrisma } from "./helpers/db";

/** Movements are global (no userId) — unique names avoid cross-test/run collisions. */
const unique = (base: string) => `${base} ${Date.now()}-${Math.floor(Math.random() * 10_000)}`;

test.describe("body-weight movements", () => {
  test("flags a movement as body-weight at creation and keeps inputs editable", async ({ authed }) => {
    const { page } = authed;
    await page.goto("/movements");
    const checkbox = page.getByLabel("Body-weight");
    await checkbox.check();
    await expect(checkbox).toBeChecked();

    const pullUpName = unique("Pull Up");
    const name = page.getByPlaceholder("Movement name");
    await name.fill(pullUpName); // still editable after clicking the checkbox
    await expect(name).toHaveValue(pullUpName);
    await page.getByRole("button", { name: /add/i }).click();
    await expect(name).toHaveValue(""); // form resets; checkbox resets too

    // Server-fn round-trip is not awaited by the click, so poll until the row is durable.
    await expect(async () => {
      const flagged = await testPrisma.movement.findFirst({ where: { name: pullUpName } });
      expect(flagged?.isBodyweight).toBe(true);
    }).toPass();

    // plain creation (checkbox auto-reset after onSuccess) keeps the flag false
    const benchName = unique("Bench Press");
    await name.fill(benchName);
    await page.getByRole("button", { name: /add/i }).click();
    await expect(async () => {
      const plain = await testPrisma.movement.findFirst({ where: { name: benchName } });
      expect(plain?.isBodyweight).toBe(false);
    }).toPass();
  });

  test("keeps the name input editable and form submittable after checking the box", async ({ authed }) => {
    const { page } = authed;
    await page.goto("/movements");
    const checkbox = page.getByLabel("Body-weight");
    const name = page.getByPlaceholder("Movement name");
    await checkbox.check();
    await name.fill("Dip");
    await expect(name).toHaveValue("Dip");
    await expect(checkbox).toBeChecked();
    await expect(page.getByRole("button", { name: /add/i })).toBeEnabled();
  });

  test("defaults set weight to the latest recorded body weight and keeps it editable", async ({ authed }) => {
    const { page, user } = authed;
    await seedWeights(user.id, [{ daysAgo: 400, weightLbs: 180 }, { daysAgo: 0, weightLbs: 184 }]);
    await testPrisma.workout.create({ data: { userId: user.id } });

    // create the body-weight movement through the UI (exercises the Task 2 flag)
    const pullUpName = unique("Pull Up");
    await page.goto("/movements");
    await page.getByLabel("Body-weight").check();
    await page.getByPlaceholder("Movement name").fill(pullUpName);
    await page.getByRole("button", { name: /add/i }).click();

    await page.goto("/current-workout");
    await page.getByLabel("Movement").selectOption({ label: pullUpName });
    await page.getByPlaceholder("Reps").fill("10");

    const weight = page.getByLabel("Weight");
    await expect(weight).toHaveValue("184"); // latest by recordedAt beats the 400-day-old 180

    await weight.fill("200"); // input stays editable after auto-fill
    await page.getByRole("button", { name: /add/i }).click();
    await expect(async () => {
      const set = await testPrisma.set.findFirst({
        where: { movement: { name: pullUpName }, workout: { userId: user.id } },
      });
      expect(set?.weight).toBe(200); // edited value persisted, not the default
    }).toPass({ timeout: 5_000 });
  });

  test("does not fetch body weight for a regular movement", async ({ authed }) => {
    const { page, user } = authed;
    await seedWeights(user.id, [{ daysAgo: 0, weightLbs: 184 }]);
    await testPrisma.workout.create({ data: { userId: user.id } });
    const benchName = unique("Bench Press");
    await testPrisma.movement.create({ data: { name: benchName, isBodyweight: false } });
    const bench = await testPrisma.movement.findFirstOrThrow({ where: { name: benchName } });

    await page.goto("/current-workout");
    await page.getByLabel("Movement").selectOption({ label: benchName });
    await expect(page.getByLabel("Weight")).toHaveValue(""); // regular movement: never auto-filled
    await page.getByPlaceholder("Reps").fill("5");
    await page.getByLabel("Weight").fill("135");
    await page.getByRole("button", { name: /add/i }).click();
    await expect(async () => {
      const set = await testPrisma.set.findFirst({
        where: { movement: { id: bench.id }, workout: { userId: user.id } },
      });
      expect(set?.weight).toBe(135); // completing a real round-trip proves the page settled
    }).toPass({ timeout: 5_000 });
  });

  test("leaves weight empty for a body-weight movement when no weight was ever recorded", async ({ authed }) => {
    const { page, user } = authed;
    await testPrisma.workout.create({ data: { userId: user.id } });
    const dipName = unique("Dip");
    await testPrisma.movement.create({ data: { name: dipName, isBodyweight: true } });

    await page.goto("/current-workout");
    await page.getByLabel("Movement").selectOption({ label: dipName });
    await expect(page.getByLabel("Weight")).toHaveValue(""); // no records -> no default, no crash
    await page.getByPlaceholder("Reps").fill("8");
    await page.getByLabel("Weight").fill("95"); // manual entry still possible
    await page.getByRole("button", { name: /add/i }).click();
    await expect(async () => {
      const set = await testPrisma.set.findFirst({
        where: { movement: { name: dipName }, workout: { userId: user.id } },
      });
      expect(set?.weight).toBe(95);
    }).toPass({ timeout: 5_000 });
  });
});
