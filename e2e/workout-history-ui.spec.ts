import { expect, test } from "./fixtures";
import { seedCompletedWorkout } from "./helpers/db";

const day = (d: Date) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
const time = (d: Date) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(d);
const dayLong = (d: Date) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(d);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

test("renders workout cards with time, movement summary, and actions", async ({ authed }) => {
  const { page, user } = authed;
  await seedCompletedWorkout(user.id, {
    daysAgo: 1,
    sets: [
      { movementName: "Card Bench", weight: 135, reps: 10 },
      { movementName: "Card Curl", weight: 30, reps: 12 },
    ],
  });

  await page.goto("/workout-history");
  const date = daysAgo(1);
  await expect(page.getByText(day(date))).toBeVisible();
  await expect(page.getByText(time(date))).toBeVisible();
  await expect(page.getByText("Card Bench")).toBeVisible();
  await expect(page.getByText("Card Curl")).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Check details for workout ${day(date)} at ${time(date)}` }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: `Delete workout ${day(date)} at ${time(date)}` })).toBeVisible();
});

test("opens the dialog through the URL and closes with Back", async ({ authed }) => {
  const { page, user } = authed;
  await seedCompletedWorkout(user.id, {
    daysAgo: 1,
    sets: [{ movementName: "Dialog Bench", weight: 135, reps: 10 }],
  });
  const date = daysAgo(1);

  await page.goto("/workout-history");
  await page.getByRole("button", { name: `Check details for workout ${day(date)} at ${time(date)}` }).click();

  await expect(page).toHaveURL(/workout=/);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText(dayLong(date));

  await page.goBack();
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("keeps the dialog closed for an unknown workout id", async ({ authed }) => {
  const { page } = authed;
  await page.goto("/workout-history?workout=missing");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: "Workout History" })).toBeVisible();
});

test("shows a calm empty state for a workout with zero sets", async ({ authed }) => {
  const { page, user } = authed;
  await seedCompletedWorkout(user.id, { daysAgo: 1, sets: [] });
  const date = daysAgo(1);

  await page.goto("/workout-history");
  await page.getByRole("button", { name: `Check details for workout ${day(date)} at ${time(date)}` }).click();

  await expect(page.getByRole("dialog")).toContainText("No movements in this workout.");
  await expect(page.getByRole("tab")).toHaveCount(1); // Overview only
});

test("deletes a workout card", async ({ authed }) => {
  const { page, user } = authed;
  await seedCompletedWorkout(user.id, {
    daysAgo: 1,
    sets: [{ movementName: "Delete Bench", weight: 135, reps: 10 }],
  });
  const date = daysAgo(1);

  await page.goto("/workout-history");
  await page.getByRole("button", { name: `Delete workout ${day(date)} at ${time(date)}` }).click();
  await expect(
    page.getByRole("button", { name: `Check details for workout ${day(date)} at ${time(date)}` }),
  ).toHaveCount(0);
});

test("wraps long movement names on a phone and lists the rest in a popover", async ({ authed }) => {
  const { page, user } = authed;
  const names = Array.from({ length: 6 }, (_, i) => `Long Movement Name ${i + 1} With Extra Words`);
  await seedCompletedWorkout(user.id, {
    daysAgo: 1,
    sets: names.map((movementName, i) => ({ movementName, weight: 100, reps: 10 })),
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/workout-history");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);

  const lastDetails = page.getByRole("button", { name: /Check details for workout/ }).last();
  await lastDetails.scrollIntoViewIfNeeded();
  const box = await lastDetails.boundingBox();
  expect(box!.y + box!.height).toBeLessThan(844 - 56);

  await page.getByRole("button", { name: "Show all 6 movements" }).click();
  await expect(page.getByText(names[5]!)).toBeVisible();
});

test("closes with Escape and restores focus to the trigger", async ({ authed }) => {
  const { page, user } = authed;
  await seedCompletedWorkout(user.id, {
    daysAgo: 1,
    sets: [{ movementName: "Escape Bench", weight: 135, reps: 10 }],
  });
  const date = daysAgo(1);
  const trigger = page.getByRole("button", { name: `Check details for workout ${day(date)} at ${time(date)}` });

  await page.goto("/workout-history");
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("tabs support arrow-key navigation", async ({ authed }) => {
  const { page, user } = authed;
  await seedCompletedWorkout(user.id, {
    daysAgo: 1,
    sets: [
      { movementName: "Alpha Bench", weight: 135, reps: 10 },
      { movementName: "Zulu Squat", weight: 225, reps: 5 },
    ],
  });
  const date = daysAgo(1);

  await page.goto("/workout-history");
  await page.getByRole("button", { name: `Check details for workout ${day(date)} at ${time(date)}` }).click();

  const overview = page.getByRole("tab", { name: "Overview" });
  await overview.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Alpha Bench" })).toBeFocused();
  await expect(page.getByRole("tab", { name: "Alpha Bench" })).toHaveAttribute("aria-selected", "true");
});
