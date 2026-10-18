# Weight Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Logged-in users record their integer body weight (lbs) on a new `/profile` page and see a line chart of it over time with an auto-fitting time axis; bad entries are deletable.

**Architecture:** Follow the existing app patterns exactly: Prisma model + migration; TanStack Start server functions in `src/lib/weight.server.ts`; one route dir `src/routes/__index/_layout.profile/` with a `-queries/profile.ts` module; a shared `WeightInput` component adopted by the new page and the existing workout form; Playwright e2e using a forged session-cookie helper (no auth infrastructure exists and none is built).

**Tech Stack:** Bun, TanStack Start/Router/Query, Prisma 7 (`@prisma/adapter-pg`) + PostgreSQL, zod v4, Better Bookkeeping UI (shadcn wrapper), `@tanstack/charts` v1.1.0 + `d3-scale`, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-17-weight-tracking-design.md`

## Global Constraints

- Package manager/runtime is **Bun**; run everything via `bun run <script>` (see `CLAUDE.md`).
- Server functions: `createServerFn` from `"@tanstack/react-start"`, `authMiddleware` from `@/lib/auth.server`, DB via `getServerSidePrismaClient()` from `@/lib/db.server`. Mirror `src/lib/workouts.server.ts` in shape.
- Weight unit is **lbs, integers only, everywhere**. Tracker validation: `z.number().int().min(1).max(1500)`. The workout set entry keeps `min(0)` on the client; the set server zod is NOT changed.
- `recordedAt` is set server-side via the Prisma `@default(now())` — the client never sends a datetime.
- Deletes are **user-scoped**: find the record with `{ id, userId: context.user.id }` before deleting; not found → `{ success: false, error }`.
- Chart library is **`@tanstack/charts` (v1.1.0), fixed — no fallback library ever**, reduced fidelity accepted. Adaptive time axis comes from D3 `scaleUtc`.
- Migration and prerequisites: `bun run db:migrate` needs the dev DB (`bun run dev` / `scripts/dev.sh up`) running. e2e also needs the dev server on `http://localhost:3000` (playwright.config has no webServer).
- e2e auth is **mocked only via the forged session cookie helper — no new auth tests, no auth infra built**.
- Conventional commits (commitlint): `feat:`, `test:`, `chore(db):`, one per task, add only the task's files.

## Review Focus

Inputs/failure modes the spec implies but is silent on — each pinned by the named task:

1. **Decimal input** (`"84.5"`, `"84,5"`, `"-8"`, scientific `1e3`) typed into either weight field → entry is blocked; add stays disabled/disabled submit. → pinned by Task 5 e2e.
2. **Out-of-range integers** (`0` on the tracker [valid on workout set], `2000` everywhere) → blocked. → pinned by Task 5 e2e.
3. **Same-day repeated weigh-ins** and unequal gaps (2 days, then a week, then a month) → both entries kept, chart renders the points, list ordering stable ascending. → pinned by Task 7 e2e.
4. **Cross-user delete** — `deleteWeightServerFn` called with another user's record id → `{ success: false }`, record untouched, no error leak. → owned by Task 2 (no unit-test infra; the `findFirst({ where: { id, userId } })` scoping and the not-found branch are explicitly reviewable code, reviewer verifies).
5. **Long span legibility** (months/years of data, crowded day ticks) → `scaleUtc` + `ticks` must keep labels readable; visual check in Task 6, reviewer looks at the rendered chart during whole-branch review.

---

### Task 1: Prisma model `BodyWeightRecord`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<generated_ts>_add_body_weight_record/migration.sql` (via migration command)

**Interfaces:**
- Produces: `prisma.bodyWeightRecord` with `id: string`, `userId: string`, `weightLbs: number`, `recordedAt: Date`; `User.bodyWeights` relation by `userId`.

- [ ] **Step 1: Add the model to `prisma/schema.prisma`** (after `Set`), plus the relation on `User`:

```prisma
model User {
  // existing fields unchanged, plus:
  bodyWeights BodyWeightRecord[]
}

model BodyWeightRecord {
  id         String   @id @default(uuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  weightLbs  Int
  recordedAt DateTime @default(now())

  @@index([userId, recordedAt])
}
```

- [ ] **Step 2: Migrate** (dev DB must be running)

Run: `bun run db:migrate -- --name add_body_weight_record`
Expected: migration created and applied; client regenerated. If `db:migrate` fails because Postgres is down, start `bun run dev` first, then retry.

- [ ] **Step 3: Verify types**

Run: `bun run typecheck`
Expected: PASS (no schema-related errors).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "chore(db): add BodyWeightRecord model"
```

### Task 2: Server functions `src/lib/weight.server.ts`

**Files:**
- Create: `src/lib/weight.server.ts`

**Interfaces:**
- Consumes: Task 1 `prisma.bodyWeightRecord`.
- Produces (exact):

```ts
// POST, authMiddleware, inputValidator z.object({ weightLbs: z.number().int().min(1).max(1500) })
addBodyWeightServerFn: (input?: { data: { weightLbs: number } })
  => Promise<{ success: true; record: BodyWeightRecordDTO } | never>
// The add creates the row with only { userId, weightLbs } — recordedAt comes from @default(now()).

// GET (default), authMiddleware, no input
getWeightsServerFn: () => Promise<BodyWeightRecordDTO[]>
// prisma.bodyWeightRecord.findMany({ where: { userId: context.user.id }, orderBy: { recordedAt: "asc" } })

// POST, authMiddleware, inputValidator z.object({ id: z.string() })
deleteWeightServerFn: (input?: { data: { id: string } })
  => Promise<{ success: boolean; error?: string }>
// findFirst({ where: { id: data.id, userId: context.user.id } });
// null -> { success: false, error: "Record not found" }; else delete -> { success: true }
// Return { success: true, record } from add; return plain record arrays from get (shape follows getCurrentWorkoutServerFn's plain return).
```

- [ ] **Step 1: Implement** the three functions copying the structural pattern of `src/lib/workouts.server.ts` (creator headers, middleware chain, type annotation `{ context: { user: { id: string } } }` style).

- [ ] **Step 2: Verify**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/weight.server.ts
git commit -m "feat(weight): body weight server functions"
```

### Task 3: e2e auth helper + session smoke test

**Files:**
- Create: `e2e/helpers/auth.ts`
- Create: `e2e/weight-tracking.spec.ts`

**Interfaces:**
- Produces (exact, used by Tasks 4–7):

```ts
createTestUser(): Promise<{ id: string; email: string }>
// unique email: `e2e-${crypto.randomUUID()}@test.local`, name "E2E User", password "e2test-password"
sessionCookieFor(userId: string): PlaywrightCookie[]
// name "session", value `${userId}.${HMAC-SHA256(userId, COOKIE_SECRET).hexdigest}`,
// domain "localhost", path "/", httpOnly true, sameSite "Lax"
```

Env fallbacks (read from process.env, default dev values): `E2E_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/demo_project"`, `E2E_COOKIE_SECRET ?? "change-me-in-production"` — matching `.env.local`. Use `PrismaPg` adapter + `PrismaClient` from `../../prisma/generated/client/client` exactly as `src/lib/db.server.ts` does.

- [ ] **Step 1: Write the failing smoke test** in `e2e/weight-tracking.spec.ts`:

```ts
test("forged session cookie is accepted", async ({ page }) => {
  const user = await createTestUser();
  await page.context().addCookies(sessionCookieFor(user.id));
  await page.goto("/profile");
  await expect(page).not.toHaveURL(/sign-in/);
});
```

- [ ] **Step 2: Verify it fails first** (no helper exists yet → import error; or unauthenticated redirect)

Run: `bunx playwright test e2e/weight-tracking.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the helper** `e2e/helpers/auth.ts` per the Interfaces block.

- [ ] **Step 4: Verify it passes** (dev server must be up)

Run: `bunx playwright test e2e/weight-tracking.spec.ts`
Expected: PASS (the chunk that matters: NOT redirected to /sign-in — `/profile` itself may 404, which is fine).

- [ ] **Step 5: Commit**

```bash
git add e2e/helpers/auth.ts e2e/weight-tracking.spec.ts
git commit -m "test(e2e): forged session helper for weight tracking"
```

### Task 4: `/profile` route skeleton + nav

**Files:**
- Create: `src/routes/__index/_layout.profile/-queries/profile.ts`
- Create: `src/routes/__index/_layout.profile/index.tsx`
- Modify: `src/routes/__index/_layout.tsx` (nav array only)

**Interfaces:**
- Consumes: Task 2 `getWeightsServerFn`, Task 3 helper (in tests).
- Produces: `bodyWeightsQueryOptions(): queryOptions({ queryKey: ["body-weights"], queryFn: () => getWeightsServerFn() })`. Route id string exactly `createFileRoute("/__index/_layout/profile/")` (folder named `_layout.profile`, matching `_layout.movements`).

- [ ] **Step 1: Write the failing tests** (append to `e2e/weight-tracking.spec.ts`, auth sequence from Task 3 in `test.beforeEach`):

```ts
test(`navigates via "Profile" nav item to a titled page`, async ({ page }) => {
  await page.goto("/current-workout");          // any authed page
  await page.getByRole("link", { name: "Profile" }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
});
test(`shows the empty weight section before any entry`, async ({ page }) => {
  await page.goto("/profile");
  await expect(page.getByText("Weight Tracking")).toBeVisible();
  await expect(page.getByText(/no weight entries/i)).toBeVisible();
});
```

- [ ] **Step 2: Verify tests fail** → `bunx playwright test e2e/weight-tracking.spec.ts` → FAIL (no route).

- [ ] **Step 3: Implement**: nav item `{ to: "/profile", label: "Profile", icon: User }` (lucide `User` is already imported in `_layout.tsx`; place it after "Movements"); `-queries/profile.ts` per pattern of `_layout.current-workout/-queries`; route file with `beforeLoad`-style protection by the layout (none inside — the `__index/_layout` already guards), loader `context.queryClient.ensureQueryData(bodyWeightsQueryOptions())`, and a page rendering: `h1` "Profile", a `Card` titled "Weight Tracking", and the empty state `No weight entries yet...` when the list is empty.

- [ ] **Step 4: Verify tests pass** → `bunx playwright test e2e/weight-tracking.spec.ts` → PASS; `bun run typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/__index/_layout.profile src/routes/__index/_layout.tsx e2e/weight-tracking.spec.ts src/routeTree.gen.ts
git commit -m "feat(profile): profile route with weight section skeleton"
```

### Task 5: `WeightInput` + add/delete + entry list (both pages)

**Files:**
- Create: `src/components/weight-input.tsx`
- Modify: `src/routes/__index/_layout.profile/index.tsx` (form, add/delete mutations, list)
- Modify: `src/routes/__index/_layout.current-workout/index.tsx` (swap bare weight `Input` for `WeightInput` with `min={0} max={1500}`)
- Modify: `e2e/weight-tracking.spec.ts`

**Interfaces:**
- Produces (exact):

```ts
type WeightInputProps = {
  value: string;
  onChange: (value: string) => void;
  min?: number;   // default 1
  max?: number;   // default 1500
  disabled?: boolean;
  className?: string;
};
export function WeightInput(props: WeightInputProps): JSX.Element;
export function isValidWeight(value: string, min: number, max: number): boolean;
// valid = /^\d*$/ (digits only; strips "-", ".", "e/ekomma" on input), empty allowed while typing,
// and when non-empty num >= min && num <= max. Renders the UI `<Input type="number">` plus a "lbs" suffix.
```

- [ ] **Step 1: Write the failing tests** (auth from Task 3):

```ts
test(`adds 184 lbs and lists it`, async ({ page }) => {
  await page.goto("/profile");
  await page.getByLabel("Weight").fill("184");
  await page.getByRole("button", { name: /add/i }).click();
  await expect(page.getByText(/184 lbs/)).toBeVisible();
});
test(`blocks decimal, zero and out-of-range input`, async ({ page }) => {
  await page.goto("/profile");
  const weight = page.getByLabel("Weight");
  const add = page.getByRole("button", { name: /add/i });
  await weight.fill("84.5");  await expect(add).toBeDisabled();
  await weight.fill("0");     await expect(add).toBeDisabled();
  await weight.fill("2000");  await expect(add).toBeDisabled();
});
test(`deletes an entry`, async ({ page }) => {
  await page.goto("/profile");
  await page.getByLabel("Weight").fill("190");
  await page.getByRole("button", { name: /add/i }).click();
  await page.getByText(/190 lbs/).waitFor();
  await page.getByRole("button", { name: /delete/i }).first().click();
  await expect(page.getByText(/190 lbs/)).not.toBeVisible();
});
```

- [ ] **Step 2: Verify tests fail** → `bunx playwright test e2e/weight-tracking.spec.ts` → FAIL.

- [ ] **Step 3: Implement** the `WeightInput` component and wire the page: form (`<form onSubmit>` with `e.preventDefault()`, submit disabled when `!isValidWeight(...)`), `addBodyWeightMutation` calling `addBodyWeightServerFn({ data: { weightLbs: parseInt(value) } })`, `deleteWeightMutation` calling `deleteWeightServerFn({ data: { id } })`, both `onSuccess: invalidateQueries({ queryKey: bodyWeightsQueryOptions().queryKey })` (add also clears the input) — mutating exactly like `_layout.current-workout`. Entries list under the form, ascending, each row: "184 lbs — Oct 17, 2026 3:45 PM" + a delete ghost button. In `_layout.current-workout`, replace the weight `<Input>` with `<WeightInput value={weight} onChange={setWeight} min={0} max={1500} className="w-24" />` (submit-gating `!weight` stays).

- [ ] **Step 4: Verify tests pass** → `bunx playwright test e2e/weight-tracking.spec.ts` → PASS; `bun run typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/weight-input.tsx src/routes/__index/_layout.profile/index.tsx src/routes/__index/_layout.current-workout/index.tsx e2e/weight-tracking.spec.ts
git commit -m "feat(weight): weight input component, add and delete entries"
```

### Task 6: Weight-over-time chart

**Files:**
- Install: `bun add @tanstack/charts d3-scale` + `bun add -D @types/d3-scale`
- Create: `src/routes/__index/_layout.profile/weight-chart.tsx`
- Modify: `src/routes/__index/_layout.profile/index.tsx` (render chart above the list)
- Modify: `e2e/weight-tracking.spec.ts`

**Interfaces:**
- Consumes: `bodyWeightsQueryOptions()` data rows `{ recordedAt: string; weightLbs: number }` (records serialize to strings over the server-fn boundary — `new Date(...)` them before charting).
- Produces: `export function WeightChart({ records }: { records: { recordedAt: Date | string; weightLbs: number }[] }): JSX.Element` — internal: `defineChart` + `lineY` + `dot` marks; `x` D3 `scaleUtc`, `nice: true`, `ticks: 6` (adaptive day→month→year tick density); `y` compact `scaleLinear` (`nice: true`, `grid: true`, label "Weight (lbs)"); `tooltip`; `<Chart definition={definition} height={320} ariaLabel="Weight over time" />` from `@tanstack/charts/react`.

- [ ] **Step 1: Write the failing test** (after adding one entry in the Task 5 flow):

```ts
await expect(page.locator(`svg[aria-label="Weight over time"]`)).toBeVisible();
```

- [ ] **Step 2: Verify it fails** → chart absent → FAIL.

- [ ] **Step 3: Implement** `weight-chart.tsx` and mount it between title and list (entries still present). Exactly one record must render the single `dot` point (the line mark renders nothing for a lone point — the dot covers it); empty records → the page shows the Task 4 empty state instead of the chart.

- [ ] **Step 4: Verify tests pass** → `bunx playwright test e2e/weight-tracking.spec.ts` → PASS; `bun run typecheck` → PASS. Visual check: chart reads sensibly; scaleUtc tick densities with months-apart points (covered fully in Task 7).

- [ ] **Step 5: Commit**

```bash
git add src/routes/__index/_layout.profile e2e/weight-tracking.spec.ts package.json bun.lock
git commit -m "feat(weight): weight-over-time chart"
```

### Task 7: Full e2e matrix (gaps, ordering, unequal spans)

**Files:**
- Modify: `e2e/weight-tracking.spec.ts`
- Optional helper addition: `e2e/helpers/auth.ts` — `seedWeights(userId: string, rows: { daysAgo: number; weightLbs: number }[]): Promise<void>` using `prisma.bodyWeightRecord.createMany` with `recordedAt: new Date(Date.now() - daysAgo * 86_400_000)`.

**Interfaces:**
- Consumes: `seedWeights` (produces fixed `recordedAt` values so tests don't depend on real time).

- [ ] **Step 1: Write the tests** (all auth from Task 3):

```ts
test(`lists entries ascending after adds`, async ({ page }) => {
  await seedWeights(userId, [{ daysAgo: 7, weightLbs: 185 }, { daysAgo: 1, weightLbs: 183 }]);
  await page.goto("/profile");
  const stamps = await page.locator(`[data-testid="weight-entry"] [data-recorded-at]`).evaluateAll((els) => els.map((e) => e.getAttribute("data-recorded-at")));
  expect(new Date(stamps[0]!) < new Date(stamps[1]!)).toBe(true); // first row is oldest
});
test(`same-day weigh-ins both listed and charted`, async ({ page }) => {
  await seedWeights(userId, [{ daysAgo: 0, weightLbs: 184 }, { daysAgo: 0, weightLbs: 186 }]);
  await page.goto("/profile");
  await expect(page.getByText(/184 lbs/)).toBeVisible();
  await expect(page.getByText(/186 lbs/)).toBeVisible();
  await expect(page.locator(`svg[aria-label="Weight over time"]`)).toBeVisible();
});
test(`months-apart data still renders a legible chart`, async ({ page }) => {
  await seedWeights(userId, [{ daysAgo: 400, weightLbs: 200 }, { daysAgo: 30, weightLbs: 190 }, { daysAgo: 2, weightLbs: 185 }]);
  await page.goto("/profile");
  await expect(page.locator(`svg[aria-label="Weight over time"]`)).toBeVisible();
});
```

The entry rows carry `data-testid="weight-entry"` and a machine-readable `data-recorded-at` (ISO datetime attribute) on the row element — add those attributes to the Task 5 list rendering (the row is the natural place, the widget the test does the rest).

- [ ] **Step 2: Verify all pass** → `bunx playwright test` → PASS (full suite).

- [ ] **Step 3: Commit**

```bash
git add e2e/weight-tracking.spec.ts e2e/helpers/auth.ts
git commit -m "test(e2e): weight tracking ordering, gaps and chart presence"
```

---

## Post-Plan Verification

Run the whole gate once after the last task:

```bash
bun run typecheck        # PASS
bunx playwright test     # all PASS (dev server + dev DB up)
```

Then the whole-branch reviewer checks the four spec areas: DB relations (Task 1), server scoping (Task 2, Review Focus #4), chart adaptivity fidelity (Review Focus #5), and the workout-page refactor didn't change set-entry semantics (`min 0` bodyweight sets still work).

## Post-implementation environment notes (durable, gitignored-ledger extraction)

- PRISMA CLIENT / DOCKER: `prisma/generated/` is gitignored, so a fresh checkout must run `bun run generate` before building. The dev container image predates `BodyWeightRecord`: a plain `docker compose up` WITHOUT `--build` serves a stale client and `/profile` SSR crashes with `reading 'findMany' of undefined`; fixed out-of-band once via `docker cp prisma/generated/. demo-project:/app/prisma/generated/` + restart — instead run `docker compose up -d --build`. Durable fixes for later: run generate in the container entrypoint, or add `prisma/generated` to the compose watch sync list.
- PLAYWRIGHT / UBUNTU 26.04: pinned Playwright 1.57.0 refuses to install chromium for ubuntu26.04-x64. Workaround in place outside the repo: symlink `~/.cache/ms-playwright/chromium_headless_shell-1200` -> the newer installed headless shell. Durable fixes: bump `@playwright/test`, or set `channel: "chrome"` (system Chrome present).
- E2E FLAKINESS: the first `bunx playwright test` run after a dev-server restart can flake on vite optimize churn; it stabilizes on the second run.
- SEROVAL: the top-level `"seroval": "1.4.2"` pin is LOAD-BEARING — attempting to remove it and regenerate the lockfile (bun.lock re-flattens to nested seroval@1.3.2 alongside seroval@1.4.2) passed two consecutive e2e runs, then broke intermittently (3 weight-tracking tests failed on and off) while vite logged `new dependencies optimized: … seroval`; the optimizer can resolve the wrong copy of the dual-version state and server-fn deserialization degrades. Pin restored to `1.4.2`, lockfile regenerated, full suite green again. Do not remove this pin until seroval is unified across the graph.
- GUIDANCE: on charted pages prefer `getByRole("spinbutton")` over `getByLabel("Weight")` (chart svg aria-label starts with "Weight").
