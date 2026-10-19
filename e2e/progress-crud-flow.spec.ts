import { test, expect } from "@playwright/test";
import { createTestUser, sessionCookieFor, testPrisma } from "./helpers/auth";
import { waitForHydration } from "./helpers/hydration";

const day = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(d);

// Single end-to-end CRUD flow through the real UI:
// create movement -> read (empty) -> start workout -> add set -> complete ->
// history details -> movement chart -> delete -> database is clean again.
test("progress crud flow: create, read, update, complete, details, delete", async ({ page }) => {
  const user = await createTestUser();
  await page.context().addCookies(sessionCookieFor(user.id));

  // Unique name so the global (non-unique) movement table never collides.
  const name = `Flow Bench ${Date.now()}`;

  // 1. Create movement via the /movements form.
  await page.goto("/movements");
  await waitForHydration(page);
  await page.getByPlaceholder("Movement name (e.g. Bench Press)").fill(name);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: name })).toBeVisible();

  // 2. Read (empty): the movement detail page has no completed workouts yet.
  await page.getByRole("link", { name }).click();
  await expect(page).toHaveURL(/\/movements\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText("No completed workouts yet.")).toBeVisible();

  // 3. Create a workout and add a set through the current-workout page.
  await page.getByRole("link", { name: "Current Workout" }).click();
  await waitForHydration(page);
  await page.getByRole("button", { name: "Start Workout" }).click();

  const addSetForm = page.locator("form").filter({ hasText: "Select movement" });
  await addSetForm.getByLabel("Movement").selectOption({ label: name });
  await page.getByLabel("Weight").fill("135");
  await page.getByPlaceholder("Reps").fill("10");
  await addSetForm.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("10 reps × 135 lbs")).toBeVisible();

  // 4. Complete the workout; the page returns to the idle state.
  await page.getByRole("button", { name: "Complete Workout" }).click();
  await expect(page.getByText("No active workout")).toBeVisible();

  // 5. History details: the most recent (only) completed workout is selected
  // by default and shows the movement's three metrics from its sets.
  await page.getByRole("link", { name: "Workout History" }).click();
  await waitForHydration(page);
  const completedToday = day(new Date());
  await expect(page.getByRole("button", { name: `Select workout ${completedToday}` })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("paragraph").filter({ hasText: name })).toBeVisible();
  // Single movement, single set: one per-run line plus the aggregates.
  await expect(page.getByText(/135\s+lbs/).first()).toBeVisible();
  await expect(page.getByText(/1st: 135 lbs × 10/)).toBeVisible();
  await expect(page.getByText(/10\s+reps/)).toBeVisible();
  await expect(page.getByText(/1,350/)).toBeVisible();

  // One bubble chart per movement (the flow workout has only one).
  await expect(
    page.getByRole("img", {
      name: `${name} — weight vs reps (area = volume) on ${completedToday}`,
    }),
  ).toBeVisible();

  // 6. Movement chart: one dot, and the tooltip switches metric to volume.
  await page.getByRole("link", { name: "Movements" }).click();
  await page.getByRole("link", { name }).click();
  await waitForHydration(page);
  const movementChart = page.getByRole("img", { name: `${name} — Max Weight over time` });
  await expect(movementChart.locator("circle")).toHaveCount(1);

  // focus-layer duplicate intercepts locator hovers; move the mouse instead
  const dot = await movementChart.locator("circle").first().boundingBox();
  await page.mouse.move(dot!.x + dot!.width / 2, dot!.y + dot!.height / 2);
  await expect(movementChart.locator("..")).toHaveText(/135\b/);

  // move the pointer off the chart so the focus layer/tooltip from the Max
  // Weight hover does not leak extra circles into the next metric's render
  await page.mouse.move(0, 0);

  await page.getByLabel("Metric").selectOption({ label: "Total Volume" });
  const volumeChart = page.getByRole("img", { name: `${name} — Total Volume over time` });
  await expect(volumeChart.locator("circle")).toHaveCount(1);
  const volumeDot = await volumeChart.locator("circle").first().boundingBox();
  await page.mouse.move(volumeDot!.x + volumeDot!.width / 2, volumeDot!.y + volumeDot!.height / 2);
  // 135 * 10 = 1350; tooltip groups thousands ("1,350") but 135 (max weight)
  // would be ambiguous, hence the optional comma + boundary
  await expect(volumeChart.locator("..")).toHaveText(/1,?350\b/);

  // 7. Delete from history: list empties and the database is clean.
  await page.getByRole("link", { name: "Workout History" }).click();
  await waitForHydration(page);
  await page.getByRole("button", { name: /Delete workout/ }).click();
  await expect(page.getByText("No completed workouts yet.")).toBeVisible();

  expect(await testPrisma.workout.count({ where: { userId: user.id } })).toBe(0);
  expect(await testPrisma.set.count({ where: { workout: { userId: user.id } } })).toBe(0);
});
