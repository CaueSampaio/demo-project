import { expect, test } from "./fixtures";
import { testPrisma } from "./helpers/db";

/** Movements are global (no userId) — unique names avoid cross-test/run collisions. */
const unique = (base: string) => `${base} ${Date.now()}-${Math.floor(Math.random() * 10_000)}`;

test.describe("Movements", () => {
  test.describe("create", () => {
    test("should create a new movement with a valid name", async ({ authed }) => {
      const { page } = authed;
      await page.goto("/movements");
      const name = unique("Leg Press");
      const input = page.getByPlaceholder("Movement name (e.g. Bench Press)");

      await input.fill(name);
      await page.getByRole("button", { name: "Add" }).click();
      await expect(input).toHaveValue(""); // onSuccess resets the controlled input

      // The server-fn round-trip is not awaited by the click, so poll until durable.
      await expect(async () => {
        const movement = await testPrisma.movement.findFirst({ where: { name } });
        expect(movement?.isBodyweight).toBe(false);
      }).toPass();
    });

    test("should show the new movement in the movements list", async ({ authed }) => {
      const { page } = authed;
      await page.goto("/movements");
      const name = unique("Leg Press");

      await page.getByPlaceholder("Movement name (e.g. Bench Press)").fill(name);
      await page.getByRole("button", { name: "Add" }).click();

      await expect(page.getByRole("listitem").filter({ hasText: name })).toBeVisible();
    });

    test("should clear the input after creating a movement", async ({ authed }) => {
      const { page } = authed;
      await page.goto("/movements");
      const input = page.getByPlaceholder("Movement name (e.g. Bench Press)");

      await input.fill(unique("Leg Press"));
      await page.getByRole("button", { name: "Add" }).click();

      await expect(input).toHaveValue("");
    });

    test("should keep Add disabled while the name is empty", async ({ authed }) => {
      const { page } = authed;
      await page.goto("/movements");
      const input = page.getByPlaceholder("Movement name (e.g. Bench Press)");
      const add = page.getByRole("button", { name: "Add" });

      await expect(input).toHaveValue("");
      await expect(add).toBeDisabled();

      await input.fill(unique("Leg Press"));
      await expect(add).toBeEnabled();
    });
  });

  test.describe("search and badges", () => {
    test("filters movements by name and restores the list", async ({ authed }) => {
      const { page } = authed;
      const alpha = unique("Searchable Alpha");
      const beta = unique("Searchable Beta");
      await testPrisma.movement.createMany({ data: [{ name: alpha }, { name: beta }] });

      await page.goto("/movements");
      const search = page.getByLabel("Search movements");

      await search.fill("Searchable Alpha");
      await expect(page.getByRole("listitem").filter({ hasText: alpha })).toBeVisible();
      await expect(page.getByRole("listitem").filter({ hasText: beta })).toHaveCount(0);

      await search.fill("");
      await expect(page.getByRole("listitem").filter({ hasText: beta })).toBeVisible();
    });

    test("shows a bodyweight badge and keeps the movement link name", async ({ authed }) => {
      const { page } = authed;
      const name = unique("Weighted Dip");
      await testPrisma.movement.create({ data: { name, isBodyweight: true } });

      await page.goto("/movements");
      const row = page.getByRole("listitem").filter({ hasText: name });
      await expect(row.getByText("Bodyweight")).toBeVisible();
      await expect(row.getByRole("link", { name })).toBeVisible();
    });
  });

  test.describe("read", () => {
    test("should display all movements on the movements page", async ({ authed }) => {
      const { page } = authed;
      const first = unique("Row");
      const second = unique("Curl");
      await testPrisma.movement.createMany({ data: [{ name: first }, { name: second }] });

      await page.goto("/movements");

      await expect(page.getByRole("listitem").filter({ hasText: first })).toBeVisible();
      await expect(page.getByRole("listitem").filter({ hasText: second })).toBeVisible();
    });

    test("should show movements sorted alphabetically", async ({ authed }) => {
      const { page } = authed;
      const az = unique("AZ Movement");
      const mz = unique("MZ Movement");
      const ze = unique("ZE Movement");
      // Inserted reverse-alphabetically to prove ordering comes from the query, not row order.
      await testPrisma.movement.createMany({ data: [{ name: ze }, { name: mz }, { name: az }] });

      await page.goto("/movements");
      await expect(page.getByRole("listitem").filter({ hasText: az })).toBeVisible();

      const texts = await page
        .getByRole("listitem")
        .evaluateAll((items) => items.map((item) => item.textContent?.trim() ?? ""));
      const idxAz = texts.indexOf(az);
      const idxMz = texts.indexOf(mz);
      const idxZe = texts.indexOf(ze);

      expect(idxAz).toBeGreaterThanOrEqual(0);
      expect(idxAz).toBeLessThan(idxMz);
      expect(idxMz).toBeLessThan(idxZe);
    });
  });
});
