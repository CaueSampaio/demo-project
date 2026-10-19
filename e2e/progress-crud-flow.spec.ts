import { expect, test } from "./fixtures";
import { seedCompletedWorkout, testPrisma } from "./helpers/db";

const day = (d: Date) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
const time = (d: Date) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(d);

// End-to-end CRUD flow through the real UI: create movement, read, start workout,
// add set, complete, history details, movement chart, delete, DB clean again.
test("progress crud flow: create, read, update, complete, details, delete", async ({ authed }) => {
  const { page, user } = authed;

  // A prior workout for a different movement gives the Overview volume chart a
  // second date to trend; a fresh account alone would show the placeholder.
  await seedCompletedWorkout(user.id, {
    daysAgo: 1,
    sets: [{ movementName: `Flow Warmup ${Date.now()}`, weight: 45, reps: 10 }],
  });

  // Unique name so the global (non-unique) movement table never collides.
  const name = `Flow Bench ${Date.now()}`;

  await page.goto("/movements");
  await page.getByPlaceholder("Movement name (e.g. Bench Press)").fill(name);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: name })).toBeVisible();

  await page.getByRole("link", { name }).click();
  await expect(page).toHaveURL(/\/movements\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText("No completed workouts yet.")).toBeVisible();

  await page.getByRole("link", { name: "Current Workout" }).click();
  await page.getByRole("button", { name: "Start Workout" }).click();

  const addSetForm = page.locator("form").filter({ hasText: "Select movement" });
  await addSetForm.getByLabel("Movement").selectOption({ label: name });
  await page.getByLabel("Weight").fill("135");
  await page.getByPlaceholder("Reps").fill("10");
  await addSetForm.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("10 reps × 135 lbs")).toBeVisible();

  await page.getByRole("button", { name: "Complete Workout" }).click();

  // Completion redirects straight to the new workout's detail dialog.
  await expect(page).toHaveURL(/\/workout-history\?workout=/);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // Completion writes `completedAt` server-side; capture the exact value so the
  // card's time-based accessible name cannot race a minute boundary.
  let completedAt: Date | null = null;
  await expect(async () => {
    const workout = await testPrisma.workout.findFirst({
      where: { userId: user.id, completedAt: { not: null }, sets: { some: { movement: { name } } } },
      select: { completedAt: true },
    });
    completedAt = workout?.completedAt ?? null;
    expect(completedAt).not.toBeNull();
  }).toPass();

  const completedDate = completedAt!;
  await expect(dialog.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByRole("img", { name: `Volume by movement for ${day(completedDate)}` })).toBeVisible();

  await dialog.getByRole("tab", { name }).click();
  await expect(
    dialog.getByRole("img", { name: `${name} — weight vs reps (area = volume) on ${day(completedDate)}` }),
  ).toBeVisible();
  await expect(dialog.getByText(/1st: 135 lbs × 10 reps/)).toBeVisible();
  await expect(dialog.getByText(/1,350/).first()).toBeVisible();
  await expect(dialog.getByText(/10\s+reps/).first()).toBeVisible();

  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("link", { name: "Movements" }).click();
  await page.getByRole("link", { name }).click();
  const movementChart = page.getByRole("img", { name: `${name} — Max Weight over time` });
  await expect(movementChart.locator("circle")).toHaveCount(1);

  // focus-layer duplicate intercepts locator hovers; move the mouse instead
  const dot = await movementChart.locator("circle").first().boundingBox();
  await page.mouse.move(dot!.x + dot!.width / 2, dot!.y + dot!.height / 2);
  await expect(movementChart.locator("..")).toHaveText(/135\b/);

  // Move off the chart so the hover tooltip does not leak circles into the next render.
  await page.mouse.move(0, 0);

  await page.getByLabel("Metric").selectOption({ label: "Total Volume" });
  const volumeChart = page.getByRole("img", { name: `${name} — Total Volume over time` });
  await expect(volumeChart.locator("circle")).toHaveCount(1);
  const volumeDot = await volumeChart.locator("circle").first().boundingBox();
  await page.mouse.move(volumeDot!.x + volumeDot!.width / 2, volumeDot!.y + volumeDot!.height / 2);
  // 1350 groups thousands; the optional comma disambiguates it from the 135 max weight.
  await expect(volumeChart.locator("..")).toHaveText(/1,?350\b/);

  // Back on the history page, both cards are deleted through their card actions.
  await page.getByRole("link", { name: "Workout History" }).click();
  const deleteButton = page.getByRole("button", { name: /Delete workout/ });
  await expect(deleteButton).toHaveCount(2);
  await deleteButton.first().click();
  await expect(deleteButton).toHaveCount(1);
  await deleteButton.first().click();
  await expect(page.getByText("No completed workouts yet.")).toBeVisible();

  expect(await testPrisma.workout.count({ where: { userId: user.id } })).toBe(0);
  expect(await testPrisma.set.count({ where: { workout: { userId: user.id } } })).toBe(0);
});
