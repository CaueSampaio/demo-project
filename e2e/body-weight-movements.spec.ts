import { test, expect } from "@playwright/test";
import { createTestUser, sessionCookieFor, testPrisma } from "./helpers/auth";

/** Movements are global (no userId) — unique names avoid cross-test/run collisions. */
const unique = (base: string) => `${base} ${Date.now()}-${Math.floor(Math.random() * 10_000)}`;

test.describe("body-weight movements", () => {
  let userId: string;

  test.beforeEach(async ({ page }) => {
    const user = await createTestUser();
    userId = user.id;
    await page.context().addCookies(sessionCookieFor(user.id));
  });

  test("flags a movement as body-weight at creation and keeps inputs editable", async ({ page }) => {
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

  test("keeps the name input editable and form submittable after checking the box", async ({ page }) => {
    await page.goto("/movements");
    const checkbox = page.getByLabel("Body-weight");
    const name = page.getByPlaceholder("Movement name");
    await checkbox.check();
    await name.fill("Dip");
    await expect(name).toHaveValue("Dip");
    await expect(checkbox).toBeChecked();
    await expect(page.getByRole("button", { name: /add/i })).toBeEnabled();
  });
});
