# UI/UX Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the app shell and every page on a single Paper & Ink design system, make the app mobile-first, and rework Workout History into cards plus a tabbed detail modal with volume and weight × reps charts.

**Architecture:** Add Tailwind v4 design tokens and shared local UI primitives, then replace the fixed-sidebar layout with a viewport shell (fixed desktop sidebar, independently scrolling main, mobile top bar + bottom tabs). Keep all server functions untouched. Put pure workout/date aggregation in `src/lib/` with Bun unit tests, and use the existing Playwright suite for page and interaction behavior. Workout History cards open a URL-driven Radix dialog with an Overview tab and one tab per movement.

**Tech Stack:** TanStack Start/Router, React 19, Tailwind CSS v4, TanStack Charts 1.1, Radix Dialog/Tabs/Popover/Tooltip, Playwright, Bun test.

**Spec:** `docs/superpowers/specs/2026-10-19-ui-improvements-design.md`

## Global Constraints

- Visual direction is **Paper & Ink**: background `#FAF7F0`, foreground `#171614`, card `#FFFDF7`, muted `#F1ECE1`, border `#E1D8C8`, input border `#D8CEBD`, primary `#224F6A`, accent `#F5C518`.
- Typeface is Manrope (400–800). Remove Raleway/Roboto.
- Desktop sidebar is visible at `lg` and above. Mobile bottom tabs are visible below `lg`.
- No schema changes, no server-function changes, no new API behavior, no workout duration.
- `Workout.completedAt` supplies date and time. `Set.createdAt` supplies set time.
- Delete actions stay immediate; no confirmation dialog.
- Keep the “Logged in as” string in the desktop sidebar.
- Keep existing accessible names and visible copy where tests depend on them. When the structure changes, update the test, not the behavior.
- No page may introduce its own border, radius, shadow, or color values outside the tokens.
- All interactive targets are at least 44px on mobile.
- Respect `prefers-reduced-motion`.
- Use Bun: `bun run typecheck`, `bun run test`, `bun test src`.
- Workout History dialog state is `?workout=<id>`; Back closes it.

## Review Focus

1. **Completed workout with zero sets:** opening it must show a calm empty state, no movement tabs, and no crash.
2. **More than five movements / more than six workouts:** Overview keeps top 5 + “Other”, and the six-workout window ends at the selected workout.
3. **Older workout opened while newer ones exist:** the Overview must not include newer workouts, and the selected date must be marked.
4. **Invalid or deleted `?workout=` id:** the dialog stays closed, the page remains usable, and no error boundary triggers.
5. **390px with long movement names / many chips:** no horizontal overflow, the last card action clears the bottom tab bar, and all text remains readable.

---

### Task 1: Design tokens, typography, and core controls

**Files:**
- Modify: `src/styles.css`
- Modify: `src/routes/__root.tsx` (font links and body classes only)
- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/ui/card.tsx`
- Modify: `src/components/ui/input.tsx`
- Modify: `src/components/ui/select.tsx`
- Modify: `src/components/ui/alert.tsx`
- Create: `src/components/ui/badge.tsx`
- Create: `src/components/ui/field.tsx`
- Create: `src/components/ui/checkbox.tsx`
- Modify: `src/routes/sign-in.tsx` (wrapper background only; full auth layout is Task 3)
- Test: `e2e/ui-foundation.spec.ts`

**Interfaces:**
- Consumes: existing `cn()` from `@/lib/utils`.
- Produces: Tailwind classes `bg-background`, `text-foreground`, `bg-card`, `text-muted-foreground`, `border-border`, `bg-primary`, `text-primary-foreground`, `bg-accent`, `text-accent-foreground`, `bg-destructive`, `text-destructive-foreground`, `bg-success`, `bg-warning`, `ring-ring`, `bg-chart-1` … `bg-chart-5`.
- Produces: `Button` with variants `default | secondary | outline | ghost | destructive | link | accent` and sizes `sm | default | lg | icon`.
- Produces: `Badge` with variants `neutral | brand | accent | success | destructive`.
- Produces: `Field({ label, htmlFor, hint, error, children })`.
- Produces: `Checkbox` forwarding native input props.

- [ ] **Step 1: Write the failing foundation test**

```ts
// e2e/ui-foundation.spec.ts
import { expect, test } from "./fixtures";

test("publishes the Paper & Ink tokens and Manrope", async ({ page }) => {
  await page.goto("/sign-in");

  const background = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--color-background").trim(),
  );
  expect(background).toBe("#FAF7F0");
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain("Manrope");
});

test("applies warm borders and brand-primary controls", async ({ page }) => {
  await page.goto("/sign-in");

  await expect(page.getByLabel("Email")).toHaveCSS("border-color", "rgb(216, 206, 189)");
  await expect(page.getByRole("button", { name: "Sign in" })).toHaveCSS(
    "background-color",
    "rgb(34, 79, 106)",
  );
  await expect(page.locator('[data-slot="card"]')).toHaveCSS(
    "border-top-color",
    "rgb(225, 216, 200)",
  );
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test e2e/ui-foundation.spec.ts`
Expected: FAIL — tokens missing, body font is not Manrope, input border is gray, button is not `#224F6A`.

- [ ] **Step 3: Implement the tokens and base layer in `src/styles.css`**

Define the full color table from the spec in `@theme` (`background`, `foreground`, `card`, `muted`, `border`, `input`, `primary`, `secondary`, `accent`, `destructive`, `success`, `warning`, `ring`, `chart-1`…`chart-5`), plus `--font-sans`, radii, and warm shadows. In `@layer base`:

```css
*, ::before, ::after { border-color: var(--color-border); }
body { @apply bg-background text-foreground font-sans antialiased; }
```

Keep the existing `@import "tailwindcss";`. Add `::selection` with primary and reduced-motion handling.

- [ ] **Step 4: Update the core controls**

- `Card`: `bg-card text-card-foreground rounded-2xl border border-border shadow-xs`; add `data-slot="card"`, `CardDescription`, `CardFooter`.
- `Button`: brand-blue default, warm secondary, outline, ghost, destructive, link, accent. Add focus ring using `ring-ring`; keep `disabled:opacity-50` and `aria-busy`.
- `Input` / `Select`: `bg-card border-input rounded-[10px] h-10`; focus ring; native select chevron.
- `Alert`: use the status surfaces from the spec.
- `Badge`, `Field`, `Checkbox`: implement the interfaces above with warm tokens and visible focus.

- [ ] **Step 5: Load Manrope and set the body class**

In `src/routes/__root.tsx`, replace the Raleway/Roboto stylesheet with Manrope 400–800. Set `<body className="overflow-hidden bg-background text-foreground">` (the shell will replace the overflow rule in Task 2).

- [ ] **Step 6: Run the foundation test**

Run: `bun run test e2e/ui-foundation.spec.ts`
Expected: PASS.

- [ ] **Step 7: Run typecheck**

Run: `bun run typecheck`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/styles.css src/routes/__root.tsx src/components/ui src/routes/sign-in.tsx e2e/ui-foundation.spec.ts
git commit -m "feat: add paper design tokens and core controls"
```

---

### Task 2: App shell, desktop sidebar, mobile bottom tabs, scroll fix

**Files:**
- Create: `src/components/app-shell.tsx`
- Modify: `src/routes/__index/_layout.tsx`
- Modify: `src/routes/__root.tsx` (devtools position bottom-right if not already)
- Test: `e2e/ui-shell.spec.ts`

**Interfaces:**
- Consumes: `Button`, `cn`, `Link`, `Outlet`, `useRouterState` if needed.
- Produces: `AppShell({ user, children }: { user: { name: string | null; email: string }; children: React.ReactNode })`.
- Produces: desktop `<nav aria-label="Primary">`, mobile `<nav aria-label="Mobile">`, `<main id="main-content">` with `overflow-y-auto`.

- [ ] **Step 1: Write the failing shell test**

```ts
// e2e/ui-shell.spec.ts
import { expect, test } from "./fixtures";
import { seedCompletedWorkout } from "./helpers/db";

async function seedLongHistory(userId: string) {
  for (let i = 1; i <= 12; i++) {
    await seedCompletedWorkout(userId, {
      daysAgo: i,
      sets: [{ movementName: `Shell Movement ${i}`, weight: 100, reps: 8 }],
    });
  }
}

test.describe("desktop shell", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("keeps the sidebar fixed and scrolls only the main region", async ({ authed }) => {
    await seedLongHistory(authed.user.id);
    await authed.page.goto("/workout-history");

    await expect(authed.page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    await expect(authed.page.getByRole("navigation", { name: "Mobile" })).toBeHidden();

    const main = authed.page.getByRole("main");
    expect(await main.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    await main.evaluate((el) => { el.scrollTop = 240; });
    expect(await main.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  });
});

test.describe("mobile shell", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("exposes the skip link and a visible keyboard focus ring", async ({ authed }) => {
    await authed.page.goto("/current-workout");
    await authed.page.keyboard.press("Tab");
    await expect(authed.page.getByRole("link", { name: "Skip to main content" })).toBeFocused();

    const profile = authed.page.getByRole("banner").getByRole("link", { name: "Profile" });
    for (let i = 0; i < 5; i++) {
      await authed.page.keyboard.press("Tab");
      if (await profile.evaluate((el) => el === document.activeElement)) break;
    }
    await expect(profile).toBeFocused();
    expect(await profile.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe("none");
  });

  test("shows bottom tabs, hides the sidebar, and avoids horizontal overflow", async ({ authed }) => {
    await seedLongHistory(authed.user.id);
    await authed.page.goto("/current-workout");

    await expect(authed.page.getByRole("navigation", { name: "Primary" })).toBeHidden();
    await expect(authed.page.getByRole("navigation", { name: "Mobile" })).toBeVisible();
    expect(await authed.page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);

    await authed.page.getByRole("navigation", { name: "Mobile" })
      .getByRole("link", { name: "Workout History" })
      .click();
    await expect(authed.page).toHaveURL(/\/workout-history$/);

    const main = authed.page.getByRole("main");
    await main.evaluate((el) => { el.scrollTop = 240; });
    expect(await main.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test e2e/ui-shell.spec.ts`
Expected: FAIL — the current layout has no mobile nav and the main region does not scroll.

- [ ] **Step 3: Implement `AppShell`**

- Outer `div`: `flex h-dvh overflow-hidden bg-background`.
- Sidebar: `hidden lg:flex lg:w-64 xl:w-72 flex-col bg-muted border-r border-border`; wordmark, primary nav, account footer with “Logged in as”, user name/email, and Log out.
- Main column: `flex min-w-0 flex-1 flex-col`.
- Mobile top bar: semantic `<header>` with `lg:hidden flex h-14 items-center justify-between border-b border-border bg-muted px-4`; wordmark and avatar link to `/profile` labelled “Profile”.
- `<main id="main-content" className="min-h-0 flex-1 overflow-y-auto">` containing a `mx-auto w-full max-w-6xl px-4 py-6 pb-24 md:px-6 md:py-8 lg:px-8 lg:pb-8`.
- Bottom nav: `lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border bg-muted pb-[env(safe-area-inset-bottom)]`; four equal links; use `activeProps={{ "aria-current": "page" }}`; active link uses brand blue and a small yellow marker.
- Skip link as the first focusable element: `sr-only focus:not-sr-only` → `#main-content`.
- Preserve the exact “Logged in as” text.

- [ ] **Step 4: Wire the layout route**

`src/routes/__index/_layout.tsx` keeps `beforeLoad` and renders `<AppShell user={user}><Outlet /></AppShell>`.

- [ ] **Step 5: Move devtools**

In `src/routes/__root.tsx`, change the TanStack devtools `position` to `"bottom-right"`.

- [ ] **Step 6: Run the shell test**

Run: `bun run test e2e/ui-shell.spec.ts`
Expected: PASS.

- [ ] **Step 7: Run the existing behavior suites most likely affected**

Run: `bun run test e2e/auth.spec.ts e2e/workouts.spec.ts`
Expected: PASS (the “Logged in as” footer is still present).

- [ ] **Step 8: Commit**

```bash
git add src/components/app-shell.tsx src/routes/__index/_layout.tsx src/routes/__root.tsx e2e/ui-shell.spec.ts
git commit -m "feat: add responsive app shell and mobile bottom navigation"
```

---

### Task 3: Auth, logout, and root error page polish

**Files:**
- Modify: `src/routes/sign-in.tsx`
- Modify: `src/routes/create-account.tsx`
- Modify: `src/routes/logout.tsx`
- Modify: `src/routes/__root.tsx` (error component only)
- Test: `e2e/ui-auth.spec.ts`
- Keep passing: `e2e/auth.spec.ts`

**Interfaces:**
- Consumes: `Field`, `Input`, `Button`, `Alert`, `Card`.
- Produces: one `h1` per auth page; the existing labels/buttons/placeholders remain.

- [ ] **Step 1: Write the failing auth UI test**

```ts
// e2e/ui-auth.spec.ts
import { expect, test } from "./fixtures";

test("sign-in exposes a single clear heading", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { level: 1, name: "Sign in to your account" })).toBeVisible();
});

test("create-account has no horizontal overflow on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/create-account");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await expect(page.getByLabel("Name")).toBeVisible();
});

test("logout presents one clear action", async ({ page }) => {
  await page.goto("/logout");
  await expect(page.getByText("Sign out of Better Bookkeeping?")).toBeVisible();
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test e2e/ui-auth.spec.ts`
Expected: FAIL — auth headings are `h3`-based and the logout route is an unstyled form.

- [ ] **Step 3: Implement the auth layout**

- Use `lg:grid lg:grid-cols-2` full-height paper page.
- Left panel: `bg-primary` with white wordmark (`filter: brightness(0) invert(1)`) and a short value statement; hidden below `lg`.
- Right panel: centered `max-w-md` form using `Field`, `Input`, `Button`, `Alert`.
- Use a real `<h1>` for the page title; keep the copy “Sign in to your account” / “Create your account”.
- Keep labels, placeholders, autocomplete, `minLength`, error copy, and button names exactly.
- Remove `console.log("Result", result)`.

- [ ] **Step 4: Implement the logout card**

Centered `Card` on paper: heading “Sign out of Better Bookkeeping?”, primary “Log out” button, Cancel link to `/current-workout`. Keep the form submit and navigation behavior.

- [ ] **Step 5: Update the root error page**

Apply `Card`, `Alert`, `Button`, tokens, and keep the existing copy/actions. Do not change error handling.

- [ ] **Step 6: Run the auth tests**

Run: `bun run test e2e/ui-auth.spec.ts e2e/auth.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/routes/sign-in.tsx src/routes/create-account.tsx src/routes/logout.tsx src/routes/__root.tsx e2e/ui-auth.spec.ts
git commit -m "feat: polish auth, logout, and error surfaces"
```

---

### Task 4: Formatting and workout analytics (pure functions)

**Files:**
- Create: `src/lib/format.ts`
- Create: `src/lib/format.test.ts`
- Create: `src/lib/workout-analytics.ts`
- Create: `src/lib/workout-analytics.test.ts`
- Modify: `package.json` (add `"test:unit": "bun test src"`)

**Interfaces:**
- Produces:
  - `formatWorkoutDate(date: Date | string): string` → `"Fri, Oct 17, 2026"`
  - `formatWorkoutDateLong(date: Date | string): string` → `"Friday, October 17, 2026"`
  - `formatWorkoutTime(date: Date | string): string` → `"6:30 PM"`
  - `formatWorkoutDateTime(date: Date | string): string` → `"Fri, Oct 17, 2026 · 6:30 PM"`
  - `formatWeightEntry(record: { recordedAt: Date | string; weightLbs: number }): string` → `"182 lbs — Aug 30, 2026, 7:00 AM"`
  - `formatNumber(value: number): string`
  - `summarizeWorkout(workout: WorkoutLike): WorkoutSummary`
  - `summarizeMovements(workout: WorkoutLike): MovementSummary[]` (alphabetical)
  - `sixWorkoutWindow(workouts: WorkoutLike[], selectedId: string): WorkoutLike[]` (ascending, ending at selected)
  - `volumeOverviewSeries(workouts: WorkoutLike[], selectedId: string): VolumeOverview`
- Types:
  ```ts
  export type WorkoutSetLike = {
    id: string;
    reps: number;
    weight: number;
    createdAt: Date | string;
    movement: { id: string; name: string; isBodyweight: boolean };
  };
  export type WorkoutLike = {
    id: string;
    completedAt: Date | string | null;
    sets: WorkoutSetLike[];
  };
  export type WorkoutSummary = { setCount: number; movementCount: number; totalVolume: number };
  export type MovementSummary = {
    movementId: string;
    movementName: string;
    isBodyweight: boolean;
    sets: WorkoutSetLike[];
    setCount: number;
    totalReps: number;
    maxWeight: number;
    totalVolume: number;
  };
  export type VolumeRow = { date: Date; movementName: string; volume: number };
  export type VolumeOverview = { rows: VolumeRow[]; series: string[]; selectedDate: Date | null };
  ```

- [ ] **Step 1: Write the failing format tests**

```ts
// src/lib/format.test.ts
import { describe, expect, test } from "bun:test";
import {
  formatNumber,
  formatWeightEntry,
  formatWorkoutDate,
  formatWorkoutDateLong,
  formatWorkoutDateTime,
  formatWorkoutTime,
} from "./format";

const date = new Date(2026, 9, 17, 18, 30);

describe("format", () => {
  test("formats workout date and time", () => {
    expect(formatWorkoutDate(date)).toBe("Fri, Oct 17, 2026");
    expect(formatWorkoutDateLong(date)).toBe("Friday, October 17, 2026");
    expect(formatWorkoutTime(date)).toBe("6:30 PM");
    expect(formatWorkoutDateTime(date)).toBe("Fri, Oct 17, 2026 · 6:30 PM");
  });

  test("formats weight entries and numbers", () => {
    expect(formatWeightEntry({ recordedAt: date, weightLbs: 182 })).toBe(
      "182 lbs — Oct 17, 2026, 6:30 PM",
    );
    expect(formatNumber(1840)).toBe("1,840");
  });
});
```

- [ ] **Step 2: Write the failing analytics tests**

```ts
// src/lib/workout-analytics.test.ts
import { describe, expect, test } from "bun:test";
import {
  sixWorkoutWindow,
  summarizeMovements,
  summarizeWorkout,
  volumeOverviewSeries,
  type WorkoutLike,
} from "./workout-analytics";

const workout = (id: string, daysAgo: number, sets: WorkoutLike["sets"]): WorkoutLike => ({
  id,
  completedAt: new Date(Date.now() - daysAgo * 86_400_000),
  sets,
});

const set = (id: string, movementId: string, name: string, weight: number, reps: number) => ({
  id,
  reps,
  weight,
  createdAt: new Date(),
  movement: { id: movementId, name, isBodyweight: false },
});

const w1 = workout("w1", 3, [
  set("s1", "m1", "Alpha Bench", 135, 10),
  set("s2", "m1", "Alpha Bench", 145, 8),
  set("s3", "m2", "Zulu Squat", 225, 5),
]);

describe("summaries", () => {
  test("summarizes a workout", () => {
    expect(summarizeWorkout(w1)).toEqual({
      setCount: 3,
      movementCount: 2,
      totalVolume: 135 * 10 + 145 * 8 + 225 * 5,
    });
  });

  test("groups and sorts movements, keeping set order", () => {
    const [alpha, zulu] = summarizeMovements(w1);
    expect(alpha).toMatchObject({
      movementId: "m1",
      movementName: "Alpha Bench",
      setCount: 2,
      totalReps: 18,
      maxWeight: 145,
      totalVolume: 135 * 10 + 145 * 8,
    });
    expect(alpha.sets.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(zulu.movementName).toBe("Zulu Squat");
  });
});

describe("sixWorkoutWindow", () => {
  const workouts = [1, 2, 4, 6, 8, 10].map((d) => workout(`w${d}`, d, []));

  test("ends at the selected workout", () => {
    expect(sixWorkoutWindow(workouts, "w4").map((w) => w.id)).toEqual(["w10", "w8", "w6", "w4"]);
  });

  test("uses the six most recent ending at the newest selection", () => {
    expect(sixWorkoutWindow(workouts, "w1").map((w) => w.id)).toEqual([
      "w10",
      "w8",
      "w6",
      "w4",
      "w2",
      "w1",
    ]);
  });

  test("returns no window for an unknown selection", () => {
    expect(sixWorkoutWindow(workouts, "missing")).toEqual([]);
  });
});

describe("volumeOverviewSeries", () => {
  test("only uses selected-workout movements and ends at the selected workout", () => {
    const selected = workout("selected", 2, [
      set("a", "m1", "Alpha", 100, 10),
      set("b", "m2", "Beta", 50, 10),
    ]);
    const older = workout("older", 8, [
      set("c", "m1", "Alpha", 90, 10),
      set("d", "m3", "Gamma", 70, 10),
    ]);
    const newer = workout("newer", 1, [set("e", "m1", "Alpha", 200, 10)]);

    const result = volumeOverviewSeries([newer, selected, older], "selected");
    expect(result.series).toEqual(["Alpha", "Beta"]);
    expect(result.selectedDate?.toISOString()).toBe(selected.completedAt!.toISOString());
    expect(result.rows).toContainEqual(
      expect.objectContaining({ movementName: "Alpha", volume: 1000 }),
    );
    expect(result.rows.some((row) => row.date.toISOString() === newer.completedAt!.toISOString())).toBe(false);
  });

  test("keeps the top five movements and aggregates the rest as Other", () => {
    const sets = Array.from({ length: 7 }, (_, i) =>
      set(`s${i}`, `m${i}`, `Movement ${i}`, (7 - i) * 10, 10),
    );
    const selected = workout("selected", 1, sets);
    const result = volumeOverviewSeries([selected], "selected");
    expect(result.series).toEqual(["Movement 0", "Movement 1", "Movement 2", "Movement 3", "Movement 4", "Other"]);
    expect(result.rows.filter((row) => row.movementName === "Other")).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `bun test src/lib/format.test.ts src/lib/workout-analytics.test.ts`
Expected: FAIL — modules do not exist.

- [ ] **Step 4: Implement `format.ts` and `workout-analytics.ts`**

Use `Intl.DateTimeFormat("en-US", …)` with explicit options. For analytics:

- Group sets by `movement.id`.
- `totalVolume = weight * reps`.
- `maxWeight = Math.max(...weights)`.
- `sixWorkoutWindow`: sort descending by `completedAt`, find selected, take `[selected, ...fiveOlder]`, reverse to ascending. Do not include newer workouts. Return `[]` if selected is missing/`completedAt` null.
- `volumeOverviewSeries`: candidate movements = movements in the selected workout. For each window workout and candidate, sum volume. Rank by total volume across the window, keep top 5, aggregate the rest under `"Other"`. Emit one row per workout × series, including zero volumes so stacked areas stay continuous. `series` order is the ranked names followed by `"Other"` when needed.

- [ ] **Step 5: Run the unit tests**

Run: `bun test src/lib/format.test.ts src/lib/workout-analytics.test.ts`
Expected: PASS.

- [ ] **Step 6: Add the unit script and run typecheck**

Add `"test:unit": "bun test src"` to `package.json`. Run `bun run typecheck`.
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/format.ts src/lib/format.test.ts src/lib/workout-analytics.ts src/lib/workout-analytics.test.ts package.json
git commit -m "feat: add workout analytics and formatting helpers"
```

---

### Task 5: Current Workout page

**Files:**
- Create: `src/components/page-header.tsx`
- Create: `src/components/empty-state.tsx`
- Create: `src/components/stat-card.tsx`
- Create: `src/components/ui/separator.tsx`
- Create: `src/components/ui/skeleton.tsx`
- Create: `src/components/page-skeleton.tsx`
- Modify: `src/router.tsx` (`defaultPendingComponent: PageSkeleton`, `defaultPendingMs: 150`)
- Modify: `src/routes/__index/_layout.current-workout/index.tsx`
- Test: `e2e/current-workout-ui.spec.ts`
- Keep passing: `e2e/sets.spec.ts`, `e2e/body-weight-movements.spec.ts`, `e2e/workouts.spec.ts`

**Interfaces:**
- Consumes: `summarizeWorkout`, `summarizeMovements`, `formatNumber`, `PageHeader`, `EmptyState`, `StatCard`, `Card`, `Button`, `Input`, `Select`, `WeightInput`.
- Produces: `PageHeader({ title, description?, actions? })`, `EmptyState({ icon?, title, description?, action? })`, `StatCard({ label, value, unit?, hint? })`.
- Produces summary container `data-testid="workout-summary"`.

- [ ] **Step 1: Write the failing Current Workout UI test**

```ts
// e2e/current-workout-ui.spec.ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test e2e/current-workout-ui.spec.ts`
Expected: FAIL — no summary strip, sets are a flat list, mobile form overflows.

- [ ] **Step 3: Implement the shared page primitives**

- `PageHeader`: `h1` plus optional description/actions; `flex flex-col gap-4 md:flex-row md:items-end md:justify-between`.
- `EmptyState`: icon circle, title, description, action; centered with generous padding.
- `StatCard`: label, value, optional unit/hint; warm card, tabular numerals.
- `Separator`: one-pixel warm rule with `role="separator"`.
- `Skeleton`: muted pulsing block; `PageSkeleton` composes a header block, a summary row, and two card blocks. Register it as the router-wide pending component in `src/router.tsx`.

- [ ] **Step 4: Rebuild the Current Workout page**

- Empty state keeps “No active workout. Ready to start?” and “Start Workout”.
- Active page: `PageHeader` + Complete Workout button; session card with the long date `h2`; summary strip (`data-testid="workout-summary"`).
- Add-set form: responsive grid; labels visible; keep placeholders “Reps”, label “Movement”, label “Weight”, button “Add”.
- Sets: one `<section>` per movement with an `h3` heading and its own `<ul>`. Each set `<li>` includes a `sr-only` movement name so existing movement-name filters still match, then “{reps} reps × {weight} lbs”, volume, and the delete icon button. Use `Separator` between the summary and the grouped sets.
- Do not add wrapper `<li>` elements around movement groups; list-item counts must stay equal to set counts.
- Delete button accessible name includes “Delete set”.
- Toasts on start/add/complete/delete; errors use the destructive surface.

- [ ] **Step 5: Run the focused tests**

Run: `bun run test e2e/current-workout-ui.spec.ts e2e/sets.spec.ts e2e/body-weight-movements.spec.ts e2e/workouts.spec.ts`
Expected: PASS. The `sets.spec.ts` list-item counts must still equal the number of sets.

- [ ] **Step 6: Run typecheck**

Run: `bun run typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/components/page-header.tsx src/components/empty-state.tsx src/components/stat-card.tsx src/routes/__index/_layout.current-workout/index.tsx e2e/current-workout-ui.spec.ts
git commit -m "feat: rebuild current workout page"
```

---

### Task 6: Movements page

**Files:**
- Modify: `src/routes/__index/_layout.movements/index.tsx`
- Test: `e2e/movements.spec.ts`
- Keep passing: `e2e/body-weight-movements.spec.ts`, `e2e/progress-crud-flow.spec.ts`

**Interfaces:**
- Consumes: `PageHeader`, `EmptyState`, `Badge`, `Field`, `Checkbox`, `Input`, `Button`, `Card`.
- Produces: search input labelled “Search movements”.

- [ ] **Step 1: Add failing search and badge tests**

Append to `e2e/movements.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test e2e/movements.spec.ts`
Expected: FAIL — no search input and no bodyweight badge.

- [ ] **Step 3: Implement the page**

- `PageHeader` title “Movements”.
- Add-movement card with `Field`, input placeholder “Movement name (e.g. Bench Press)”, `Checkbox` labelled “Body-weight”, Add button.
- Search `Input` with label “Search movements”, placeholder “Search by name…”, client-side case-insensitive filter, result count.
- List rows: `<ul><li>` with `<Link to="/movements/$movementId">{movement.name}</Link>`; add a `Badge` “Bodyweight” when true and a trailing chevron with `aria-hidden`. Do not change the link’s accessible name.
- Empty states: no movements vs no search matches.
- Keep alphabetical order.

- [ ] **Step 4: Run the movement tests**

Run: `bun run test e2e/movements.spec.ts e2e/body-weight-movements.spec.ts e2e/progress-crud-flow.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/__index/_layout.movements/index.tsx e2e/movements.spec.ts
git commit -m "feat: add movement search and bodyweight badges"
```

---

### Task 7: Movement detail page

**Files:**
- Modify: `src/routes/__index/_layout.movements/$movementId.tsx`
- Modify: `src/components/progress-chart.tsx` (theme only)
- Test: `e2e/movement-progress.spec.ts`

**Interfaces:**
- Consumes: `PageHeader`, `StatCard`, `EmptyState`, `Card`, `Select`, `MetricChart`.
- Produces stats container `data-testid="movement-stats"`.

- [ ] **Step 1: Add failing summary assertions**

Append to `e2e/movement-progress.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test e2e/movement-progress.spec.ts`
Expected: FAIL — no summary stats.

- [ ] **Step 3: Implement the page**

- Back link “All movements”; `PageHeader` with movement name and “All-time progress”.
- Stat cards: Max Weight, Total Reps, Total Volume, Sessions. Compute from existing `data.workouts`.
- Keep the metric select label “Metric” and chart aria label pattern `{movement} — {metric} over time`.
- Empty state keeps “No completed workouts yet.”
- Update `MetricChart` colors to brand blue, warm grid, paper tooltip; do not change the data semantics.

- [ ] **Step 4: Run the focused tests**

Run: `bun run test e2e/movement-progress.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/__index/_layout.movements/'$movementId.tsx' src/components/progress-chart.tsx e2e/movement-progress.spec.ts
git commit -m "feat: add movement progress summary and chart theme"
```

---

### Task 8: Profile page

**Files:**
- Modify: `src/routes/__index/_layout.profile/index.tsx`
- Modify: `src/routes/__index/_layout.profile/weight-chart.tsx` (theme only)
- Test: `e2e/weight-tracking.spec.ts`

**Interfaces:**
- Consumes: `PageHeader`, `StatCard`, `EmptyState`, `Card`, `Button`, `WeightInput`, `WeightChart`.
- Produces account card, `data-testid="weight-summary"`, and preserved `data-testid="weight-entry"` rows.

- [ ] **Step 1: Update the failing profile tests**

In `e2e/weight-tracking.spec.ts`, add:

```ts
test("shows account and weight summary", async ({ authed }) => {
  const { page, user } = authed;
  await seedWeights(user.id, [
    { daysAgo: 30, weightLbs: 185 },
    { daysAgo: 1, weightLbs: 183 },
  ]);

  await page.goto("/profile");

  await expect(page.getByRole("heading", { level: 1, name: "Profile" })).toBeVisible();
  const account = page.getByTestId("account-card");
  await expect(account.getByText("E2E User")).toBeVisible();
  await expect(account.getByText(user.email)).toBeVisible();
  await expect(account.getByRole("link", { name: "Log out" })).toBeVisible();

  const summary = page.getByTestId("weight-summary");
  await expect(summary).toContainText("183");
  await expect(summary).toContainText("-2");
  await expect(summary).toContainText("2");
});
```

Update every entry assertion in `weight-tracking.spec.ts` to scope to list rows, because the summary can also contain the same number:

```ts
await page.goto("/profile");
await page.getByLabel("Weight").fill("184");
await page.getByRole("button", { name: /add/i }).click();
await expect(page.getByTestId("weight-entry").filter({ hasText: "184 lbs" })).toBeVisible();
```

Apply the same `getByTestId("weight-entry")` scoping to the same-day, months-apart, and delete tests.

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test e2e/weight-tracking.spec.ts`
Expected: FAIL — no account card, no summary, and “184 lbs” may match multiple elements.

- [ ] **Step 3: Implement the page**

- `PageHeader` title “Profile”.
- Account card with `data-testid="account-card"`, name/email, and a “Log out” link to `/logout`.
- Weight summary (`data-testid="weight-summary"`): latest, change since first, entries count.
- Weight form card: label “Weight”, Add button; keep validation.
- “Weight Tracking” card with chart and history; keep `WeightChart` aria label `Weight over time`.
- Entry rows keep `data-testid="weight-entry"` and `data-recorded-at`; keep “{lbs} lbs — {date}” text.
- Delete button accessible name contains “Delete”; icon + text on desktop, icon-only on mobile is allowed only with an accessible name.
- Empty state keeps “No weight entries yet. Add one above!”.
- Toasts on add/delete.

- [ ] **Step 4: Run the profile tests**

Run: `bun run test e2e/weight-tracking.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/__index/_layout.profile/index.tsx src/routes/__index/_layout.profile/weight-chart.tsx e2e/weight-tracking.spec.ts
git commit -m "feat: rebuild profile and weight tracking"
```

---

### Task 9: Workout History cards, URL state, and dialog shell

**Files:**
- Create: `src/components/ui/dialog.tsx`
- Create: `src/components/ui/tabs.tsx`
- Create: `src/components/ui/popover.tsx`
- Create: `src/components/ui/tooltip.tsx`
- Create: `src/components/workout-history/workout-card.tsx`
- Create: `src/components/workout-history/movement-chips.tsx`
- Create: `src/components/workout-history/workout-detail-dialog.tsx`
- Modify: `src/components/app-shell.tsx` (wrap in `TooltipProvider`)
- Modify: `src/routes/__index/_layout.workout-history/index.tsx`
- Modify: `package.json` (Radix dependencies)
- Test: `e2e/workout-history-ui.spec.ts`
- Update: `e2e/workouts.spec.ts` (history card/dialog selectors)

**Interfaces:**
- Consumes: `summarizeWorkout`, `summarizeMovements`, `formatWorkoutDate`, `formatWorkoutTime`, `formatWorkoutDateTime`, `formatNumber`, `PageHeader`, `EmptyState`, `StatCard`, `Badge`, `Button`, `Card`.
- Produces: `WorkoutCard({ workout, onOpen, onDelete, deleting })`.
- Produces: `MovementChips({ movements, maxVisible }: { movements: MovementSummary[]; maxVisible?: number })`.
- Produces: `WorkoutDetailDialog({ workout, open, onOpenChange }: { workout: WorkoutLike | null; open: boolean; onOpenChange: (open: boolean) => void })`.
- Produces URL search type `{ workout?: string }`.

- [ ] **Step 1: Install Radix primitives**

Run:

```bash
bun add @radix-ui/react-dialog @radix-ui/react-tabs @radix-ui/react-popover @radix-ui/react-tooltip
```

Expected: `package.json` and `bun.lock` update.

- [ ] **Step 2: Write the failing card/dialog-shell test**

```ts
// e2e/workout-history-ui.spec.ts
import { expect, test } from "./fixtures";
import { seedCompletedWorkout } from "./helpers/db";

const day = (d: Date) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
const time = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(d);
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
  await expect(page.getByRole("button", { name: `Check details for workout ${day(date)} at ${time(date)}` })).toBeVisible();
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
  await expect(page.getByRole("button", { name: `Check details for workout ${day(date)} at ${time(date)}` })).toHaveCount(0);
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
```

- [ ] **Step 3: Run it to verify it fails**

Run: `bun run test e2e/workout-history-ui.spec.ts`
Expected: FAIL — no cards, no dialog, no URL state.

- [ ] **Step 4: Implement the UI wrappers**

- `Dialog`: Radix root/trigger/portal/overlay/content/title/description/close. Desktop centered `max-w-3xl`; mobile full-screen. Sticky header, scrollable body.
- `Tabs`: Radix tabs with underline active state and horizontal overflow.
- `Popover`: Radix popover for movement disclosure.
- `Tooltip`: Radix tooltip for chip hints; content must also be available via the Popover. Wrap the app shell in `TooltipProvider` so the wrapper is not re-created per chip.

- [ ] **Step 5: Implement `MovementChips`**

- Show up to 3 chips by default.
- If more, show a `+N more` button with accessible name `Show all {N} movements` and `aria-expanded`; open a Popover listing every movement with set count and volume.
- If 3 or fewer, show all.
- Each chip may use a Tooltip with `{setCount} sets · {volume} volume`, but the Popover provides the same information on touch.

- [ ] **Step 6: Implement `WorkoutCard`**

- Date, time, metadata row, chips, and actions.
- `Check Details` primary `size="sm"`.
- `Delete` outline `size="sm"` with trash icon; same row.
- Accessible names exactly as in the test.
- No clickable card wrapper; only buttons.

- [ ] **Step 7: Implement the route and URL state**

- Add `validateSearch` to the route so `workout` is `string | undefined`.
- `const { workout: openId } = Route.useSearch();`
- `const navigate = Route.useNavigate();`
- Open: `navigate({ search: (prev) => ({ ...prev, workout: id }) })`.
- Close: `navigate({ search: (prev) => ({ ...prev, workout: undefined }), replace: true })`.
- Find the selected workout by id. If missing, render no dialog.
- Replace the inline detail section with the card grid and `WorkoutDetailDialog`.
- Add a compact summary strip above the grid: completed workouts, total volume, movements trained (derived client-side).
- Dialog shell: title `formatWorkoutDateLong` + time, description counts, tabs “Overview” + alphabetical movement names. For this task, render a simple summary and set list; charts arrive in Task 10.
- If the workout has no sets, render “No movements in this workout.” and only the Overview tab.
- Keep the empty state text “No completed workouts yet.”.

- [ ] **Step 8: Update the existing history selectors**

In `e2e/workouts.spec.ts`, replace “Select workout” flows with card `Check details`/`Delete` buttons and assert details inside `getByRole("dialog")`. Add `weekday: "short"` to its `day` helper so accessible names match `formatWorkoutDate`. Keep the same behavioral assertions.

- [ ] **Step 9: Run the focused tests**

Run: `bun run test e2e/workout-history-ui.spec.ts e2e/workouts.spec.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add package.json bun.lock src/components/ui/dialog.tsx src/components/ui/tabs.tsx src/components/ui/popover.tsx src/components/ui/tooltip.tsx src/components/workout-history src/routes/__index/_layout.workout-history/index.tsx e2e/workout-history-ui.spec.ts e2e/workouts.spec.ts
git commit -m "feat: add workout history cards and detail dialog"
```

---

### Task 10: Workout detail charts and movement tabs

**Files:**
- Create: `src/components/workout-history/volume-overview-chart.tsx`
- Create: `src/components/workout-history/movement-set-chart.tsx`
- Modify: `src/components/workout-history/workout-detail-dialog.tsx`
- Test: `e2e/workout-progress.spec.ts`
- Update: `e2e/progress-crud-flow.spec.ts`

**Interfaces:**
- Consumes: `volumeOverviewSeries`, `summarizeWorkout`, `summarizeMovements`, `formatNumber`, `formatWorkoutDate`, `formatWorkoutTime`.
- Produces: `VolumeOverviewChart({ workouts, selectedWorkoutId })`.
- Produces: `MovementSetChart({ movementName, sets, selectedDate })`.
- Produces chart aria labels:
  - Overview: `Volume by movement for {formatWorkoutDate(selectedDate)}`
  - Movement: `{movementName} — weight vs reps (area = volume) on {formatWorkoutDate(selectedDate)}`

- [ ] **Step 1: Rewrite the history-detail test for the dialog**

Replace the selection-based tests in `e2e/workout-progress.spec.ts` with card+dialog flows. Update the imports to include `type Page` from `@playwright/test`, add the `time` formatter next to `day`, and add `weekday: "short"` to `day` so it matches `formatWorkoutDate`:

```ts
import { type Page } from "@playwright/test";

const time = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(d);

const openWorkout = async (page: Page, date: Date) => {
  await page.getByRole("button", { name: `Check details for workout ${day(date)} at ${time(date)}` }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
};

test("overview shows the selected workout and volume chart", async ({ authed }) => {
  const { page } = authed;
  await page.goto("/workout-history");
  await openWorkout(page, daysAgo(2));

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByRole("img", { name: `Volume by movement for ${day(daysAgo(2))}` })).toBeVisible();
  await expect(dialog.getByText("Selected workout")).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "Alpha Bench" })).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "Zulu Squat" })).toBeVisible();
});

test("movement tabs show weight on x, reps on y, and sets", async ({ authed }) => {
  const { page } = authed;
  await page.goto("/workout-history");
  await openWorkout(page, daysAgo(2));

  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Alpha Bench" }).click();
  const chart = dialog.getByRole("img", { name: `Alpha Bench — weight vs reps (area = volume) on ${day(daysAgo(2))}` });
  await expect(chart).toBeVisible();
  await expect.poll(() => chart.locator("circle").count(), { timeout: 15_000 }).toBe(2);
  await expect(dialog.getByText(/150\s+lbs/).first()).toBeVisible();
  await expect(dialog.getByText(/6\s+reps/).first()).toBeVisible();
  await expect(dialog.getByText(/900\s+volume/).first()).toBeVisible();
  await expect(dialog.getByText(/1st: 150 lbs × 6/)).toBeVisible();
});
```

Also add:

```ts
test("keeps top five movements plus Other", async ({ authed }) => {
  const { page, user } = authed;
  await seedCompletedWorkout(user.id, {
    daysAgo: 5,
    sets: [{ movementName: "Series 0", weight: 10, reps: 10 }],
  });
  await seedCompletedWorkout(user.id, {
    daysAgo: 1,
    sets: Array.from({ length: 7 }, (_, i) => ({
      movementName: `Series ${i}`,
      weight: (7 - i) * 10,
      reps: 10,
    })),
  });
  const date = daysAgo(1);
  await page.goto("/workout-history");
  await openWorkout(page, date);

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Other")).toBeVisible();
  await expect(dialog.getByRole("tab")).toHaveCount(8); // Overview + 7 movements
});

test("explains when there is not enough history for a trend", async ({ authed }) => {
  const { page, user } = authed;
  await seedCompletedWorkout(user.id, {
    daysAgo: 1,
    sets: [{ movementName: "Only Bench", weight: 135, reps: 10 }],
  });
  const date = daysAgo(1);

  await page.goto("/workout-history");
  await openWorkout(page, date);

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Not enough history for a trend yet.")).toBeVisible();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test e2e/workout-progress.spec.ts`
Expected: FAIL — charts are not rendered in the dialog and the old selection flow is gone.

- [ ] **Step 3: Implement `VolumeOverviewChart`**

- Call `volumeOverviewSeries(workouts, selectedWorkoutId)`.
- Use `areaY` with `x: "date"`, `y: "volume"`, `z: "movementName"`, `color: "movementName"`, `layout: stack({ order: result.series })`.
- x scale `scaleUtc`, y scale `scaleLinear`, grid, absolute stacking.
- Use chart colors 1–5 for the ranked movements and `chart-5`/neutral for “Other”; thin strokes and soft fills.
- Tooltip: date + per-movement volume.
- Add a small dot/caption for the selected date (“Selected workout”).
- `ariaLabel` exactly as specified.
- If `rows.length === 0`, render an inline empty message.
- If the window has fewer than two distinct workout dates, render “Not enough history for a trend yet.” instead of a one-point area chart.

- [ ] **Step 4: Implement `MovementSetChart`**

- One row per set in performed order: `{ reps, weight, volume, label }`.
- `lineY(rows, { x: "weight", y: "reps" })` and `dot(rows, { x: "weight", y: "reps", r: "volume", rScale: scaleSqrt().domain([0, maxVolume]).range([0, 22]), fillOpacity: 0.75 })`.
- x axis label “Weight (lbs)”, y axis label “Reps”.
- Tooltip: `Set {n}`, `{weight} lbs × {reps}`, `{volume} volume`.
- `ariaLabel` exactly as specified.

- [ ] **Step 5: Fill the dialog content**

- Overview tab: stat cards (volume, sets, movements), chart, legend, selected marker.
- Movement tabs: header + bodyweight badge, four stat cards, chart, set list with time.
- Zero movements: “No movements in this workout.” and only the Overview tab.
- Keep the dialog header and tabs sticky while the body scrolls.
- Mobile chart height 220px; desktop 280–320px.

- [ ] **Step 6: Update the CRUD flow**

In `e2e/progress-crud-flow.spec.ts`, add `weekday: "short"` to its `day` helper. After completing a workout, open the card dialog, assert the Overview chart, click the movement tab, assert the bubble chart and set text, then close and delete via the card action.

- [ ] **Step 7: Run the focused tests**

Run: `bun run test e2e/workout-progress.spec.ts e2e/progress-crud-flow.spec.ts`
Expected: PASS.

- [ ] **Step 8: Run typecheck**

Run: `bun run typecheck`
Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/components/workout-history src/routes/__index/_layout.workout-history/index.tsx e2e/workout-progress.spec.ts e2e/progress-crud-flow.spec.ts
git commit -m "feat: add workout detail overview and movement charts"
```

---

### Task 11: Full regression pass and remaining selector updates

**Files:**
- Update as needed: `e2e/auth.spec.ts`, `e2e/movements.spec.ts`, `e2e/movement-progress.spec.ts`, `e2e/weight-tracking.spec.ts`, `e2e/sets.spec.ts`, `e2e/body-weight-movements.spec.ts`, `e2e/workouts.spec.ts`, `e2e/workout-progress.spec.ts`, `e2e/progress-crud-flow.spec.ts`
- No production files expected unless a regression is found.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: a green typecheck, unit suite, and full Playwright suite.

- [ ] **Step 1: Run typecheck**

Run: `bun run typecheck`
Expected: exit 0. Fix any type errors in the task that introduced them.

- [ ] **Step 2: Run the unit suite**

Run: `bun run test:unit`
Expected: all tests pass.

- [ ] **Step 3: Run the full Playwright suite**

Run: `bun run test`
Expected: PASS. If a failure is a selector mismatch from the new UI, update the test to the new accessible name/structure. If a failure is a behavior regression, fix the production code.

- [ ] **Step 4: Spot-check the five Review Focus cases manually or with targeted tests**

- Completed workout with zero sets.
- Seven movements in one workout.
- Older workout opened with newer workouts present.
- `?workout=missing`.
- 390px with long movement names.

Add or adjust a targeted test if any of these is not already covered.

- [ ] **Step 5: Commit the cleanup**

```bash
git add e2e
git commit -m "test: align e2e suite with the new UI"
```

---

## Execution Notes

- Work task-by-task. Do not start a task until the previous task's focused tests pass.
- Keep commits small and use the messages above.
- When a test fails because the old UI is gone, update the selector to the new accessible name. Do not change the underlying behavior.
- If a shared component needs a new variant, add it to the component and use it; do not add one-off classes in pages.
- Run the mobile checks at `390×844` and the desktop checks at `1280×800`.
- Before claiming success, run `bun run typecheck`, `bun run test:unit`, and `bun run test` and report the actual output.
