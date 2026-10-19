# E2E Test Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the three stubbed Playwright suites (movements, sets, workouts), rework auth.spec.ts, migrate the two implemented suites off the old workarounds, and make `bun run test` self-sufficient: it boots Postgres if needed and always serves the production build.

**Architecture:** Playwright config gains `webServer` (build + production entry `bun .output/server/index.mjs` on dedicated port 4173) and `globalSetup` (docker-compose Postgres boot-if-missing + `prisma migrate deploy`). A shared `e2e/fixtures.ts` provides an authenticated page per test via real UI sign-up/sign-in, managing the per-IP rate-limit budget (reset + retry-once-on-429). Direct DB access survives only as a test-side Prisma client for persistence assertions and backdated/time-legacy fixtures.

**Tech Stack:** Playwright, Bun, Prisma (driver adapter `@prisma/adapter-pg`), docker compose (`docker-compose.dev.yml`, service `postgres`).

**Spec:** `docs/superpowers/specs/2026-10-19-e2e-test-suite-design.md`

## Global Constraints

- Package manager/runtime is **Bun**: use `bun x playwright test`, `bunx prisma migrate deploy`, `bun run build/format/typecheck`. Never npm/npx.
- The dedicated test port is **4173** in every file that mentions a port.
- The test-side Prisma setup moves unchanged from the existing `e2e/helpers/auth.ts` into `e2e/helpers/db.ts`: DB URL from `process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/demo_project"`, adapter `new PrismaPg({ connectionString: DATABASE_URL })`, client import path `../../prisma/generated/client/client`.
- Tests never import from `src/lib/*.functions.ts` (client bundles resolve to stubs; test files live outside the Vite graph).
- App mutations never driven by bare `APIRequestContext` POSTs — UI only; the sole exception is `POST /api/dev-reset-rate-limits` with `Origin: http://localhost:4173` header.
- Do not modify anything under `src/`, `prisma/`, or `scripts/`.
- Unique test data everywhere: emails `e2e-<uuid>@test.local`; movement names carry a `Date.now()`-random suffix. Assertions never assume an empty DB.
- Auth fixtures: password constant `e2test-password`, name `E2E User` (matches nav `user.name || user.email` rendering).
- Conventional commits; Prettier via `bun run format` before the final commit.

## Review Focus

- **Parallel-auth budget:** all workers share one IP, `createAccount: 3/min`, `signIn: 5/min` — a full fullyParallel run must see zero 429 flake because the fixture resets limits before every auth flow and retries once on "Too many attempts". Pinned by: Task 2 (fixture creation) verification run and Task 7 full run.
- **Global movement rows:** movements have no owner — list/sort tests must assert only their own uniquely-named rows. Pinned by: Task 3 read tests (`should display all movements on the movements page`, `should show movements sorted alphabetically`).
- **Fresh-user empty states:** a brand-new user's `/current-workout` shows "No active workout. Ready to start?"; completed-only data appears in `/workout-history`. Pinned by: Task 5 (`should show 'No active workout' when none exists`, `should display completed workouts in workout history`).
- **Cold machine:** suite passes when no Postgres is running (no Docker volume data guaranteed): `globalSetup` boots the compose service and then `bunx prisma migrate deploy` makes the schema exist. Pinned by: Task 1 verification step (stop compose, run one spec, restore).
- **New port vs CSRF:** the cross-origin CSRF test must retarget `_serverFn` to `127.0.0.1:4173`; wrong-port threading silently un-simulates the cross-site request. Pinned by: Task 1 step, re-confirmed by Task 6's `cross-origin POST is rejected`.

---

### Task 1: Self-sufficient prod-build test infra

**Files:**

- Modify: `playwright.config.ts`
- Create: `e2e/global-setup.ts`
- Modify: `e2e/auth.spec.ts` (only the 127.0.0.1 retarget line, ~line 160)
- Modify: `e2e/body-weight-movements.spec.ts` (probe rewrite, steps below)

**Interfaces:**

- Produces: `e2e/global-setup.ts` default `async function globalSetup(): Promise<void>` — ensures Postgres reachable at the DB URL, then runs `bunx prisma migrate deploy`.
- Produces: the served prod app at `http://localhost:4173` for every later task.
- Consumes (existing): `e2e/body-weight-movements.spec.ts` helpers removed by this task: `trackLatestWeightRequests`, `waitForHydration`.

- [ ] **Step 1: Rewrite `playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

const TEST_PORT = 4173;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: { baseURL: `http://localhost:${TEST_PORT}`, trace: "on-first-retry" },
  webServer: {
    command: "bun run build && bun .output/server/index.mjs",
    port: TEST_PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: { PORT: String(TEST_PORT), NITRO_PORT: String(TEST_PORT) },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
```

- [ ] **Step 2: Create `e2e/global-setup.ts`**

Logic: parse `process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/demo_project"` with `new URL(...)`; TCP-probe `hostname:port` (250 ms timeout); if unreachable, `execSync("docker compose -f docker-compose.dev.yml up -d postgres", { stdio: "inherit", cwd: <repo root> })` then poll reachability up to 30 s (throw with a clear message if never reachable); finally `execSync("bunx prisma migrate deploy", { stdio: "inherit", cwd: <repo root> })`. Use `node:net` + `node:child_process`; default export.

- [ ] **Step 3: Thread the port retarget in `e2e/auth.spec.ts`**

In "cross-origin POST is rejected", the route-continue URL replacement must become `//127.0.0.1:4173/` (from `//127.0.0.1:3000/`). No other auth.spec change in this task.

- [ ] **Step 4: Rewrite the dev-server probe tests in `e2e/body-weight-movements.spec.ts`**

Delete `trackLatestWeightRequests` and `waitForHydration` (and their uses). In "defaults set weight to the latest recorded body weight…": drop the `weightRequests.length ≥ 1` assertion and the network tracking; keep the seeded-weights, auto-fill (`184`), and edited-value-persisted (`200`) assertions. In "does not fetch body weight for a regular movement": replace `expect(weightRequests).toHaveLength(0)` with the user-visible behavior — after selecting the regular movement, `await expect(page.getByLabel("Weight")).toHaveValue("")`. Weigh in: add (`page.getByPlaceholder("Reps").fill("10")` etc.) as-is, and remove `waitForHydration(page)` calls everywhere (prod build needs no fiber-polling).

- [ ] **Step 5: Verify against a stopped database (cold machine)**

Run: `docker compose -f docker-compose.dev.yml stop postgres && bun x playwright test`
Expected: globalSetup boots the compose postgres service, migrates, the full existing suite passes against the prod build on 4173.
Then: `docker compose -f docker-compose.dev.yml start postgres`.

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts e2e/global-setup.ts e2e/auth.spec.ts e2e/body-weight-movements.spec.ts
git commit -m "test(e2e): run suite against production build with self-booted postgres"
```

### Task 2: Auth fixture + helpers split; migrate the two implemented suites

**Files:**

- Create: `e2e/fixtures.ts`
- Create: `e2e/helpers/db.ts`
- Modify: `e2e/weight-tracking.spec.ts`
- Modify: `e2e/body-weight-movements.spec.ts`

**Interfaces:**

- Produces (`e2e/fixtures.ts`): `expect` (re-export); `uniqueEmail(): string` (`e2e-<uuid>@test.local`); `TestUser = { name: string; email: string; password: string; id: string }`; `AuthedContext = { page: Page; user: TestUser }`; `resetRateLimits(request: APIRequestContext): Promise<void>`; `createAccount(page: Page, request: APIRequestContext, user: { name: string; email: string; password: string }): Promise<void>`; `signIn(page: Page, request: APIRequestContext, user: { email: string; password: string }): Promise<void>`; `test` — `base.test.extend<{ authed: AuthedContext }>` whose `authed` fixture: `resetRateLimits` → `createAccount` with `uniqueEmail()` + `name: "E2E User"` + password `"e2test-password"` (retry loop in `createAccount` handles a 429 once) → resolve `id` via `testPrisma.user.findUniqueOrThrow({ where: { email } })` → `use({ page, user })`.
- Produces (`e2e/helpers/db.ts`): `testPrisma` (module-level lazily-instantiated client, per Global Constraints) and `seedWeights(userId: string, rows: { daysAgo: number; weightLbs: number }[]): Promise<void>` — code moved unchanged from `e2e/helpers/auth.ts`.
- Consumes: seeded movement/workout creation uses `testPrisma` directly in tests of Tasks 3–6.

- [ ] **Step 1: Create `e2e/fixtures.ts`**

`createAccount`: goto `/create-account`; fill `getByLabel("Name"/"Email"/"Password")`; click `"Create account"`; up to 2 attempts — if "Too many attempts" becomes visible, `resetRateLimits` and retry; success = landed off `/create-account` AND `getByText("Logged in as")` visible. `signIn`: goto `/sign-in`; fill Email/Password; click `"Sign in"`; same success expectation and the same one-shot 429 retry. Export `test` and re-export `expect` so suites import both from `./fixtures`.

- [ ] **Step 2: Create `e2e/helpers/db.ts`** — move `testPrisma` + `seedWeights` out of `helpers/auth.ts` unchanged (PrismaClient import path per Global Constraints).

- [ ] **Step 3: Migrate `weight-tracking.spec.ts`**

Drop the "forged session cookie is accepted" test (tests the deleted side door). All remaining tests take `({ authed })`, use `authed.page` in place of `page`, and `authed.user.id` in place of the local `userId`; imports switch from `./helpers/auth` to `./fixtures` + `./helpers/db`. No assertion changes.

- [ ] **Step 4: Migrate `body-weight-movements.spec.ts`** the same way (fixture instead of `createTestUser`/`sessionCookieFor`; `authed.user.id` where userId was smeared).

- [ ] **Step 5: Verify**

Run: `bun x playwright test`
Expected: PASS (auth.spec untouched and still using the old helpers, which are still present until Task 6).

- [ ] **Step 6: Commit**

```bash
git add e2e/fixtures.ts e2e/helpers/db.ts e2e/weight-tracking.spec.ts e2e/body-weight-movements.spec.ts
git commit -m "test(e2e): introduce auth fixture and migrate off forged cookies"
```

### Task 3: `e2e/movements.spec.ts` — implement, minus delete

**Files:**

- Modify: `e2e/movements.spec.ts` (replace the whole stub file)

**Interfaces:**

- Consumes: `test`, `expect` from `./fixtures`; `testPrisma` from `./helpers/db`.
- Produces: the pattern for Tasks 4–5 (fixture + unique-name discipline + `toPass` DB polling).

The skeleton's "delete" describe is removed entirely (feature does not exist). Shared helper inside the file:

```ts
const unique = (base: string) => `${base} ${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
```

- [ ] **Step 1: Implement create**

`should create a new movement with a valid name`: `authed` → `page.goto("/movements")` → `getByPlaceholder("Movement name (e.g. Bench Press)").fill(unique("Leg Press"))` → click `getByRole("button", { name: "Add" })` → input resets to `""` → poll `testPrisma.movement.findFirst({ where: { name } })` with `toPass()`, expecting `isBodyweight: false`.

`should show the new movement in the movements list`: same flow, assert `page.getByRole("listitem").filter({ hasText: name })` becomes visible.

`should clear the input after creating a movement`: same flow, assert input value `""` after the click.

`should keep Add disabled while the name is empty`: fresh `/movements`, `getByRole("button", { name: "Add" })` disabled; filling a name enables it.

- [ ] **Step 2: Implement read**

`should display all movements on the movements page`: seed two movements via `testPrisma.movement.createMany` (unique names), goto `/movements`, expect both `listitem`s visible.

`should show movements sorted alphabetically`: seed three uniquely-suffixed names whose natural order is e.g. `AZ…`, `MZ…`, `ZE…` but create them in reverse `createMany` order; collect `page.getByRole("listitem")` texts with `evaluateAll`, `indexOf` each, assert `idx(AZ) < idx(MZ) < idx(ZE)`.

- [ ] **Step 3: Verify**

Run: `bun x playwright test movements`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add e2e/movements.spec.ts
git commit -m "test(e2e): implement movements suite"
```

### Task 4: `e2e/sets.spec.ts` — implement

**Files:**

- Modify: `e2e/sets.spec.ts` (replace the whole stub file)

**Interfaces:**

- Consumes: `test`, `expect` from `./fixtures`; `testPrisma` from `./helpers/db`; the same shared `unique` helper defined inside the file as in Task 3. Seeding pattern:

```ts
const movement = await testPrisma.movement.create({ data: { name: unique("Bench Press") } });
const workout = await testPrisma.workout.create({ data: { userId: authed.user.id } });
```

UI locators on `/current-workout`: `getByLabel("Movement")` (Select, `selectOption({ label })`), `getByLabel("Weight")` (WeightInput, `aria-label="Weight"`), `getByPlaceholder("Reps")`, `getByRole("button", { name: "Add" })`; set rows render as `"{name}"` + `"{reps} reps × {weight} lbs"`; delete icon button inside the row `li` (`.getByRole("button")` on the row filter).

Three describes, same two-level structure as the skeleton (`create`, `read`, `delete`), with the delete cases kept (unlike movements).

- [ ] **Step 1: Implement create**

`should add a set to the current workout`: seed movement + workout, goto `/current-workout`, select the movement, `Weight` = `135`, `Reps` = `10`, `Add` — expect row `{name}` + `10 reps × 135 lbs` visible and poll `testPrisma.set.findFirst({ where: { movement: { name }, workout: { userId } } })` weight `135`.

`should require movement, weight, and reps to add a set`: fresh `authed`, click `Start Workout` on `/current-workout` to have the form; Add disabled; select movement only → disabled; + reps → disabled; + weight → enabled.

`should display the new set in the workout`: add via UI, expect the row visible (UI-only, no DB poll needed beyond Task 4's first test).

- [ ] **Step 2: Implement read**

`should display sets with movement name, weight, and reps`: DB-seed one workout with two sets (nested `sets: { create: [{ movement: { connect: { id } }, reps, weight }] }` in the `workout.create`), assert both rows (`reps reps × weight lbs`) visible.

`should show sets in the order they were added`: via UI add reps `10`, then (same movement still selected) reps `6`; `li` `nth(0)` has `10 reps`, `nth(1)` has `6 reps`.

- [ ] **Step 3: Implement delete**

`should remove a set from the current workout`: seed workout with two sets; click the `X` button inside the row for one movement → row disappears.

`should update the sets list after deletion`: same seed; assert `getByRole("listitem")` within the sets list is 2 before the delete and 1 after; the remaining row's text still visible.

- [ ] **Step 4: Verify**

Run: `bun x playwright test sets`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add e2e/sets.spec.ts
git commit -m "test(e2e): implement sets suite"
```

### Task 5: `e2e/workouts.spec.ts` — implement

**Files:**

- Modify: `e2e/workouts.spec.ts` (replace the whole stub file)

**Interfaces:**

- Consumes: fixture + DB seeding as Task 4. Completed-workout seed shape:

```ts
await testPrisma.workout.create({
  data: {
    userId,
    completedAt: new Date(),
    sets: { create: [{ movement: { create: { name } }, reps: 8, weight: 100 }] },
  },
});
```

Expected date string is computed in-test with `new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })` (the app's own format). History rows are `<tr>` in the table (`getByRole("row")`, `.getByRole("checkbox")`), select-all is the header checkbox; delete button is `getByRole("button", { name: /Delete Selected/ })`.

- [ ] **Step 1: Implement create**

`should start a new workout from the current workout page`: fresh `authed`, goto `/current-workout`, expect "No active workout. Ready to start?", click `Start Workout` → `Complete Workout` button visible and the add-set form (`getByLabel("Movement")`) visible.

`should show the workout date after starting`: same start flow, assert the card title equals today's date string computed as above.

- [ ] **Step 2: Implement read**

`should display the current active workout`: seed workout + one set per-user, goto `/current-workout`, assert the set row is visible.

`should show 'No active workout' when none exists`: fresh `authed`, goto `/current-workout`, assert the empty-state text and `Start Workout` button.

`should display completed workouts in workout history`: seed a completed workout as above, goto `/workout-history`, assert a `row` with `Sets` count `1` and the movement-name column header.

- [ ] **Step 3: Implement complete**

`should mark the current workout as completed`: UI-start workout, add a set, click `Complete Workout` → "No active workout" empty state; poll `testPrisma.workout.findFirst({ where: { userId, completedAt: { not: null } } })` via `toPass()`.

`should move completed workout to history`: same UI flow, then goto `/workout-history` and assert the `row` with the movement name is visible.

- [ ] **Step 4: Implement delete**

`should delete selected workouts from history`: seed two completed workouts, check both rows' checkboxes, click `Delete Selected (2)` → both rows disappear; "No completed workouts yet." visible.

`should allow selecting multiple workouts for deletion`: same seed; header (select-all) checkbox checks both rows; `Delete Selected (2)` label becomes enabled/clickable.

- [ ] **Step 5: Verify**

Run: `bun x playwright test workouts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add e2e/workouts.spec.ts
git commit -m "test(e2e): implement workouts suite"
```

### Task 6: Rework `e2e/auth.spec.ts`; retire the old helpers

**Files:**

- Modify: `e2e/auth.spec.ts`
- Modify: `e2e/helpers/auth.ts` → Deleted (what remains merged in Task 2's `helpers/db.ts`)

**Interfaces:**

- Consumes: `test`, `expect`, `uniqueEmail`, `createAccount`, `signIn`, `resetRateLimits` from `./fixtures`; `testPrisma` from `./helpers/db`. Custom-password flows call `createAccount(page, request, { name, email, password })` directly.

- [ ] **Step 1: Restructure the suite**

Imports switch to `./fixtures` + `./helpers/db`. Remove `test.describe.configure({ mode: "serial" })` and `test.setTimeout(60_000)` (prod build settles fast; config defaults apply). Delete the module-local `goTo`/`fillAndSubmitSignIn`/`fillAndSubmitSignUp` in favor of `createAccount`/`signIn`. Tests keep names and coverage:
`sign-up stores an argon2id hash…` (custom password `s3cure-password` via `createAccount`, DB assert `password` matches `/^\$argon2id\$/` and ≠ plaintext); `sign-in accepts the correct password`; `sign-in rejects a wrong password…`; `legacy plaintext row is lazily migrated on sign-in` (INSERT stays direct-DB with a comment: "One intentional direct-DB fixture: legacy pre-hash user, unreachable via the UI"); `password with special characters round-trips`; `6th sign-in attempt in a minute is rate limited`; `cross-origin POST is rejected` (retarget already on 4173 from Task 1); `logout clears the session`; `movements require authentication` (fresh context, no cookies).

- [ ] **Step 2: Budget discipline**

Each test that drives an auth flow calls `resetRateLimits(request)` first (the 429-retry inside `createAccount`/`signIn` is the backstop, not the primary control). The `/api/dev-reset-rate-limits` POST keeps `headers: { origin: "http://localhost:4173" }` asserting status 200.

- [ ] **Step 3: Delete `e2e/helpers/auth.ts`** (after grepping nothing else imports it: `grep -rn "helpers/auth" e2e` → no matches).

- [ ] **Step 4: Verify**

Run: `bun x playwright test auth`
Expected: PASS (9 tests, same names as before).

- [ ] **Step 5: Commit**

```bash
git add -A e2e
git commit -m "test(e2e): rework auth suite and drop cookie-forging helpers"
```

### Task 7: Whole-suite verification and cleanup

**Files:** none new; this is the DoD gate.

- [ ] **Step 1: Leftovers gone**

Run: `grep -rn "waitForHydration\|networkidle\|sessionCookieFor\|createTestUser\|E2E_COOKIE_SECRET\|COOKIE_SECRET" e2e/ | grep -v global-setup`
Expected: exit 1 (no matches).

- [ ] **Step 2: Typecheck + format**

Run: `bun run typecheck && bun run format`
Expected: no type errors; formatting applied (include changes in the commit below).

- [ ] **Step 3: Full run**

Run: `bun x playwright test`
Expected: PASS, all suites, `fullyParallel`.

- [ ] **Step 4: Commit**

```bash
git add -A e2e playwright.config.ts
git commit -m "test(e2e): final format and whole-suite verification"
```
