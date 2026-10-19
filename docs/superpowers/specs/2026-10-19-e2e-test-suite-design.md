# E2E Test Suite — Design

## Intent

The `e2e/` directory has Playwright scaffolding, but the three domain suites
(`movements.spec.ts`, `sets.spec.ts`, `workouts.spec.ts`) are empty `test.skip`
stubs. Alongside implementing them, the existing suite carries workarounds that
were added while tests could only run against the Vite dev server; the app now
warrants a better setup. This work implements the domain tests and migrates the
whole suite to that better way.

## Why now

The current test code paper-wraps over two problems:

1. **Dev-server mode.** `playwright.config.ts` has no `webServer`; tests assume a
   Docker dev environment already running on `:3000`. Vite-in-dev hydration is
   late, so the suite grew hacks: `waitForHydration` (React-fiber polling),
   `networkidle` waits, a retry-once-submit loop in `auth.spec.ts`, and
   dev-only `_serverFn` URL decoding to track requests.
2. **Setup via side doors.** Tests forge the session cookie (`sessionCookieFor`
   HMAC-signs a user id) and seed users/weights directly through a test-side
   Prisma client (`createTestUser`, `seedWeights`). Identity and entry into the
   app are exercised nowhere except `auth.spec.ts`.

## Goals

- Implement full CRUD coverage for movements, sets, and workouts from the
  skeleton test cases.
- Rework `auth.spec.ts` to the same structure and setup patterns as the new
  suites (coverage preserved, with one named exception below).
- Migrate `weight-tracking.spec.ts` and `body-weight-movements.spec.ts` to the
  new setup, keeping their coverage.
- A test run needs no manual prerequisites: if Postgres is not running, the run
  boots it; the app under test is always the production build, served by the
  run itself.
- Test setup is driven through the app's own surface (UI flows), not by
  shadow-writing app state.

## Non-goals

- No change to application source code to make the app more testable.
- No CI pipeline work beyond what `webServer`/`globalSetup` imply.
- No new features (movement delete is explicitly out, see below).

## Decisions (made with the user)

1. **Production build under test, served by the run.** Tests never exercise the
   Vite dev server. `playwright.config.ts` runs the production build
   (`vite build`) and serves it with the repo's sanctioned production entry —
   `scripts/entry.sh` (`bun .output/server/index.mjs`, nitro node-server under
   Bun, which the argon2id/Bun.password constraint requires). Not `vite
preview`.
2. **Dedicated test port.** The served app listens on a port nothing else owns
   (e.g. `:4173`), and `baseURL` points there. A Docker dev server on `:3000`
   must never be silently reused (`reuseExistingServer` only applies to a stale
   test server on the same dedicated port).
3. **The run boots Postgres if missing.** In `globalSetup` (or an equivalent
   pre-step), if nothing accepts connections on the configured DATABASE_URL,
   boot it with `docker compose -f docker-compose.dev.yml up -d postgres`
   (service `postgres` / container `demo-project-db`) and wait for the
   healthcheck. If it is running, reuse it as-is. No schema wipes.
4. **No side doors for identity.** No more forged session cookies and no
   direct-DB user creation. Each test that needs an authenticated page gets one
   through the shared fixture, which creates the account and signs in through
   the real UI flows.
5. **Rate-limit budget is managed by the fixture.** The check this design
   received flagged the arithmetic: `createAccount` is 3/min per IP and
   `signIn` has its own budget, while runs are `fullyParallel`. So the shared
   fixture resets rate limits via the dev `POST /api/dev-reset-rate-limits`
   endpoint (sending the same-origin `Origin` header, as the current suite
   does) immediately before creating/signing-in a user, and retries once on a
   429 after another reset. A reset can only free budget, never break another
   worker's flow. The endpoint stays safe: it still refuses in production
   environments. (Amends the earlier "reset only inside auth.spec.ts" idea.)
6. **Shared dev DB + per-test users.** Tests keep pointing at the dev database.
   Isolation comes from every test creating its own user (unique email).
   Per-user data (workouts, sets, weights) is isolated for free; assertions
   never lean on "the DB is otherwise empty" (no `findAll`-on-empty semantics).
7. **Direct DB access survives in one narrow role.** A test-side Prisma client
   (the old `testPrisma`/"helpers" role) remains for (a) asserting persisted
   state and (b) seeding _time-dependent_ fixtures that cannot be made through
   the UI — backdated body-weight entries (`seedWeights`), because "recorded
   400 days ago" is not creatable via the app. That is test fixture data, not a
   workaround for app behavior. User creation through that client is gone (see
   4); password-hashing of seeded users is not needed because no users are
   seeded that way.
8. **Movement delete tests are dropped.** The app has no delete feature for
   movements (no UI, no server fn). Those skeleton cases are removed rather
   than kept as skips.
9. **Movements are global — assertions are scoped.** Movement list ordering and
   presence tests assert only on movements the test itself created (unique
   names), never on the page being free of other data.
10. **auth.spec.ts is reworked too.** Sign-up / sign-in flows in that suite are
    now the primary path for the fixture, so the suite is rewritten to the same
    patterns; coverage (argon2id hash stored, wrong-password error, legacy
    plaintext migration, special characters, rate limit, CSRF rejection,
    logout, unauthenticated redirect) is preserved. The `serial` configure and
    60s timeout are re-evaluated: with the prod build, forms settle fast, so
    defaults from `playwright.config.ts` apply unless a case proves slow.

## Test coverage map

### `e2e/movements.spec.ts`

- **create** — valid name creates a movement (persisted state also asserted via
  the test-side Prisma client); the new movement appears in the list; the input
  clears after creating.
- **read** — movements the test itself created display on the page; the list is
  sorted alphabetically (asserted by the ordering of the test's own,
  uniquely-named rows).
- **required-field validation** — Add button disabled while input is empty.
- **(dropped)** — delete cases removed: feature does not exist.

### `e2e/sets.spec.ts`

- **create** — a set can be added to the current workout; Add is disabled until
  movement, weight, and reps are provided; the new set displays in the workout.
- **read** — sets render with movement name, weight, and reps; sets list in
  the order they were added.
- **delete** — removing a set from the current workout works and the list
  updates (remaining sets stay visible in order).

### `e2e/workouts.spec.ts`

- **create** — starting a workout from `/current-workout` when none is active;
  the started workout shows today's date.
- **read** — the current active workout displays; a fresh user sees
  "No active workout"; completed workouts appear in `/workout-history`.
- **complete** — marking the current workout complete; the completed workout
  moves out of current and into history.
- **delete** — deleting selected workouts from history; multi-select
  (checkboxes incl. select-all) feeds "Delete Selected (n)".

### `e2e/auth.spec.ts` (rework)

Same cases as today, restructured: sign-up / sign-in via the shared UI helpers,
DB assertions where they check secrets/legacy rows, rate-limit reset consumed
by the fixture consistently, serial/timeout configuration revisited.

### `weight-tracking.spec.ts`, `body-weight-movements.spec.ts` (migration)

Behavior-preserving migration with one exception: the "forged session cookie is
accepted" test is dropped deliberately — it tests the side door this work
deletes. Everything else keeps coverage: forged cookies → UI sign-in fixture;
`waitForHydration` / fiber polling → removed (prod build); dev `_serverFn` URL
decoding for `getLatestBodyWeightServerFn` → replaced with a prod-build-safe
request probe or the assertion re-expressed another way.

## Shared infrastructure

- **`e2e/fixtures.ts`** (new): `test` extended from `@playwright/test` exposing
  an authenticated fixture — unique user, account created and signed in through
  `create-account` / `sign-in` UI flows, rate-limit reset handled before each
  auth flow (decision 5). Suites import `test`/`expect` from here.
- **`e2e/helpers/*`** reduces to the test-side Prisma client and `seedWeights`
  (split naming is the builder's call). The forged-cookie helper
  (`sessionCookieFor`) and `createTestUser` are deleted.
- **`playwright.config.ts`** gains `webServer` (build + production entry on the
  dedicated port) and `globalSetup` (Postgres boot-if-missing). Parallelism
  stays `fullyParallel`; the DB-isolation rules above make that safe.

## Constraints

- Package manager is **Bun**; the served app must run under Bun
  (`Bun.password`/argon2id) — hence the production entry, never a node-only
  server command.
- Server functions exist only as RPC stubs; tests must not import
  `*.functions.ts` from `src/` directly (client bundles resolve to stubs, and
  test files live outside the Vite graph) — UI flows and the dev reset route
  are the app-side touchpoints. Dev-only `_serverFn` URL parsing is out (prod
  build uses its own addressing).
- CSRF middleware rejects requests without browser `Sec-Fetch-*` metadata —
  only real browser interactions, not bare APIRequestContext POSTs, may drive
  auth mutations (the existing cross-origin CSRF test already works this way;
  the rate-limit reset POST carries an explicit same-origin `Origin` header as
  today).
- Movements have no owner column; the unique-name discipline is the only guard
  against cross-test interference.
- In-memory rate limiting is per-IP; the fixture's reset+retry is the blanket
  defense, both for auth.spec.ts'S pressure tests and every parallel worker.

## Left to the builder

- Exact `webServer` command composition (build-vs-serve split, env/PORT wiring,
  CI behavior), keeping the dedicated port consistent with `baseURL`.
- How the "lazy body-weight fetch fired" assertion is best re-expressed against
  the prod build (probe choice), or dropping that sub-assertion if its user
  visible behavior is already covered.
- Whether any suite still needs serial configuration once dev-server flakiness
  is gone (start from "no").
- File naming/splits (fixtures.ts vs helpers/) and lint/format specifics per
  `CLAUDE.md` (Prettier via `bun run format`).
- The exact reachability probe in globalSetup (tcp check vs prisma connect)
  and the `pg_isready`-respecting wait loop.
- Whether the cross-origin CSRF test's `127.0.0.1` retarget needs the new
  dedicated port threaded in.

## Verification

- `bun run test` boots (or reuses) Postgres, builds, serves, and passes every
  suite with leftovers of the old hacks absent (`waitForHydration`,
  `networkidle`, cookie forging, `createTestUser` no longer exist in e2e/).
- Running the suite while the Docker dev environment is up works (dedicated
  port), and a cold machine (no Postgres) passes too.
