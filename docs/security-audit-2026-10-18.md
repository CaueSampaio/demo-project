# Security Audit Summary — Password Hashing & Security Hardening

**Date:** 2026-10-18
**Scope:** `feat/security-hardening` branch (commits `57cd505..HEAD`), design doc
`docs/superpowers/specs/2026-10-18-password-hashing-security-hardening-design.md`
(18 findings from the read-only security recon of 2026-10-18).
**Reference:** implementation plan
`docs/superpowers/plans/2026-10-18-password-hashing-security-hardening.md`.

## Findings & resolutions

All 18 findings from the recon inventory, resolved in this pass unless noted.

| # | Finding (recon, 2026-10-18) | Resolution | Commit |
|---|---|---|---|
| 1 | `signInServerFn` compares passwords as plaintext strings | Verify with argon2id (`Bun.password.verify`); legacy plaintext rows lazily migrate on sign-in | `86bd202` (T3), hardened in `9d40de6` (T5) |
| 2 | `createAccountServerFn` stores plaintext; reveals existing emails | Password stored as argon2id hash. Anti-enumeration kept in scope and **not fixed** (future work, partner decision) | `86bd202` (T3) |
| 3 | `getUserServerFn` returns the full user row incl. `password` into router context | `select: { id, email, name, createdAt }` only — no password fields leave the DB layer | `86bd202` (T3) |
| 4 | HMAC session sign/verify uses non-constant-time string compare | `constantTimeEqual` (SHA-256 digests into `crypto.timingSafeEqual`) on both the session-token signature and legacy password comparison | `9d40de6` (T5) |
| 5 | `getAllUsersServerFn` in `sign-in.tsx` dumps all users incl. plaintext passwords | Server fn and its dev button deleted | `d667298` (T2) |
| 6 | `console.log("Creating account", …)` logs the plaintext password | Deleted | `d667298` (T2) |
| 7 | `getServerConfigServerFn` returns `cookieSecret` + `database.url` to any browser (**critical**) | `src/lib/get-server-config.server.ts` and its endpoint deleted entirely | `0ea7549` (T4) |
| 8 | `db.server.ts` obtains `DATABASE_URL` by calling the leaking server fn | Reads `configService.getAppConfig().database.url` directly (server-only) | `0ea7549` (T4) |
| 9 | `User.password` is a plain `String` | Field name kept (partner decision); content is now the argon2id hash. No schema migration | `86bd202` (T3) |
| 10 | `movements.server.ts` fns have no `authMiddleware` | Both `getMovementsServerFn` / `createMovementServerFn` require auth (`authMiddleware`; CSRF is now global — see #17) | `a8f540f` (T8) |
| 11 | `/logout` is a GET page load (logout-CSRF-prone) | User-initiated `<form method="post">` calling `logoutServerFn` | `3c92758` (T6) |
| 12 | Logout cookie delete may not match set attributes | Set/delete both use explicit `path: "/"`; delete mirrors the set attributes | `9d40de6` (T5) |
| 13 | `Dockerfile` creates `appuser` but has no `USER` directive | Production stage runs `USER appuser` | `f7010ae` (T9) |
| 14 | `public/config.js`: runtime-config mechanism is dead (envsubst never runs; dead Auth0/documentParser keys) | File, its `<script>` include in `__root.tsx`, and the `window.APP_CONFIG` path deleted; client falls through to build-time `VITE_ENVIRONMENT` | `0ea7549` (T4) |
| 15 | `CLAUDE.md` says "Auth0-based authentication"; `@auth0/auth0-react` unused | Doc corrected (credential-based auth, argon2id, HMAC session cookie); dependency removed and lockfile synced; stale `get-server-config.server.ts` references removed; dev-under-Bun documented (**this task**) | this pass |
| 16 | `e2e/helpers/auth.ts` inserts plaintext test users | `createTestUser` inserts a pinned argon2id hash (of `"e2test-password"`); custom passwords are rejected | `86bd202` (T3) |
| 17 | No rate limiting / CSRF / security headers anywhere | Origin-check `csrfMiddleware` registered **once** as global function middleware via a custom Start entry (`src/start.ts` → `createStart(() => ({ functionMiddleware: [csrfMiddleware] }))`), so it covers every server function instead of 12 per-fn `.middleware([csrfMiddleware])` attachments; per-IP in-memory fixed-window limiter (sign-in 5/min, create-account 3/min; XFF trusted for keying **only** when `TRUST_PROXY=1`; expired buckets evicted with a 10k-entry soft cap) — headers remain future work | `3c92758` (T6), `4b0a6d9` (T7), this pass (global registration) |
| 18 | `docker-compose.dev.yml` hardcodes dev creds `postgres/postgres` | Documented as acceptable for the dev-only DB (see Deployment notes); no change | n/a (accepted) |

**Count:** 18 findings → 17 fixed in this pass, 1 accepted-and-documented (#18). No finding left unfixed without an explicit partner decision.

### Honest correction to the Task 0 baseline

Task 0 ("pre-existing typecheck errors", ~14 errors in `workout-history` / `profile` pages)
turned out to be **worktree artifacts, not main-branch defects**: the gitignored generated
Prisma client was missing in the fresh worktree. `bunx prisma generate` fixed all errors with
zero code changes. There is nothing to fix on the other workstream's pages, and the baseline
was already green once the client was generated.

### Follow-through fixes folded into this task (deferred findings)

| Finding (deferred from earlier tasks) | Resolution |
|---|---|
| Lazy-migration `prisma.user.update` ran on **every** successful sign-in (rehashing already-argon2id rows on login) | Guarded with `!isPasswordHash(user.password)` — only legacy plaintext rows migrate (flagged 3× across T3/T10 reviews) |
| `resetRateLimitsServerFn` lacked `csrfMiddleware` (dev-only endpoint, but a POST server fn) | Covered by the global CSRF registration in `src/start.ts` (its explicit `.middleware([csrfMiddleware])` attachment was removed in the global-CSRF refactor) |

**Residual note — e2e flakiness observed during the final verification:** one full-suite run
at default parallelism (8 workers) failed 5 tests when the shared per-IP rate-limit buckets
were drained by concurrent auth tests before their `beforeEach` reset landed ("Too many
attempts" mid-run). The immediately following identical invocation passed clean. The limiter
keys on client IP and all tests share an IP; this is inherent to the documented in-memory
per-process design (see Deferred / future work — Redis-backed limiting). It predates this
task and is unrelated to the changes above, but a CI (single-worker) runner is the current
mitigation.

### Global CSRF registration (custom Start entry)

`csrfMiddleware` is no longer attached per server function. It is registered once in
`src/start.ts`:

```ts
import { createStart } from "@tanstack/react-start";
import { csrfMiddleware } from "./lib/csrf.server";

export const startInstance = createStart(() => ({
  functionMiddleware: [csrfMiddleware],
}));
```

TanStack Start auto-resolves `src/start.ts` at plugin-config time and aliases it as
`#tanstack-start-entry`; `startInstance.getOptions().functionMiddleware` is then prepended to
every server function's own middleware (`executeMiddleware` in `@tanstack/start-client-core`).
All 12 `.middleware([csrfMiddleware])` / `.middleware([csrfMiddleware, authMiddleware])`
attachments across `auth`, `workouts`, `weight`, `movements`, and `rate-limit` server modules
were removed as part of this change. `authMiddleware` attachments are untouched, and the
`/api/dev-reset-rate-limits` raw route keeps its own `originMismatch()` check.

**Motivation / experiment result:** the per-fn middleware-attachment pattern is a plausible
trigger for the upstream TanStack Start dev hydration bug class (#6189 server-functions +
middleware in dev, #5709, #6480), so global registration was tried both as the ergonomic ask
from the partner and as a possible fix. **Result: the failure profile is unchanged** — two
back-to-back full Playwright runs each produced `9 failed / 23 skipped / 8 did not run / 7
passed`, identical to the pre-change baseline, still failing on
`react-dom/server.browser.js` "does not provide an export named 'default'" during hydration.
The refactor is kept for its single-registration ergonomics and correctness (the CSRF e2e test
`cross-origin POST is rejected` passes, and a forged-Origin POST to a sign-in server fn is
rejected 403), but it does **not** resolve the hydration bug.

## Deferred / future work

Per the design doc's non-goals, with partner sign-off:

- **Session revocation store** — session tokens stay stateless until the 7-day expiry; a
  server-side revocation store would enable immediate logout everywhere / token rotation.
- **Redis-backed / multi-instance rate limiting** — the current limiter is in-memory and
  per-process: state resets on restart and is not shared across instances. Also the root
  cause of the parallel-e2e flakiness noted above.
- **Security headers (CSP, HSTS, X-Frame-Options…)** and a CORS review.
- **Anti-enumeration on `createAccountServerFn`** — "An account with this email already
  exists" still reveals registered emails (partner explicitly deferred).
- **Account lockout, password strength metering, MFA.**
- **CI plumbing cleanup** — the planned `.github/workflows/workflow-ex.yml` deletion was
  mooted: the file does not exist anywhere in this repository's git history (the only
  workflow is `cicd.yml`). Nothing to remove.
- Minor items parked during reviews (tracked in the SDD ledger): `logoutServerFn` promise
  lacks a `.catch`; production 403 response bodies are non-JSON and reveal endpoint
  existence; fresh-clone setup needs a `prisma generate` step (postinstall hook or docs).

## Deployment notes

- **Database is dev-only** (partner-confirmed 2026-10-18): there is no non-dev instance with
  user rows, so the plaintext→hash transition needs **no schema migration** and no backfill —
  existing dev rows lazily migrate on their next successful sign-in.
- **`.env` remains git-tracked with dev-only values.** This is flagged as a fragile pattern:
  the density of secrets in tracked env files invites real credentials, breaks
  secret-rotation hygiene, and will silently leak if the file drifts toward prod values.
  Recommendation: track `.env.example` only; keep `.env` in `.gitignore`.
- Prisma field `User.password` keeps its name and stores the argon2id hash (no rename, no
  migration).
- **Deploying behind a proxy:** set `TRUST_PROXY=1` so the rate limiter keys on the
  `X-Forwarded-For` client IP. Without it, the limiter keys on the socket IP only — behind
  a non-overwriting proxy every client would share one bucket. Do **not** set it when the
  app is exposed directly (port 3000, current dev topology): clients could spoof XFF to
  bypass per-IP limiting. Read once at startup; restart after changing.
- Deployment rests on the current Docker defaults; there is no separate production smoke run
  for this branch (prod-stage `USER appuser` verified as config, not runtime-smoked).

## Verification evidence

Run against the running Docker dev stack (port 3000) at this branch, final state:

```
$ bun run typecheck
$ tsc --noEmit
$ echo exit=$?
exit=0
```

(0 errors.)

```
$ bunx playwright test
Running 47 tests using 8 workers
  23 skipped
  24 passed (42.1s)
$ echo exit=$?
exit=0
```

(Verbatim summary lines; per-test progress lines elided. The 23 skipped are the
pre-existing `test.skip()` placeholders in `workouts.spec.ts` / `sets.spec.ts`; `auth`,
`weight-tracking`, `body-weight-movements`, `movements` specs all pass — all 9 auth e2e
tests green, including the mandatory encrypt/verify cases.)

## Resolution addendum: dev-mode hydration 500s / `hydrated: false` (root cause found & fixed)

**Root cause.** Commit `1d27e09` introduced `src/start.ts` as a custom global
`createStart` entry. TanStack Start treats `src/start.ts` as the SHARED
client+SSR entry — the client bundle's `hydrateStart.js` imports it directly.
That entry statically imported `csrfMiddleware` from `src/lib/csrf.server.ts`,
whose module top level imported `getRequest`/`getRequestHost` from
`@tanstack/react-start/server` — a server-only barrel
(`react-start-server` → `start-server-core` → `@tanstack/react-router/ssr` →
`react-dom/server.browser.js`). Vite's client transform therefore loaded the
entire SSR render runtime in the browser; there `react-dom/server.browser.js`
is CJS and the ESM import dies with `does not provide an export named
'default'`, which fails the whole hydration chunk import chain on EVERY page
load → `hydrated: false` and the family of client-only test failures across
weight-tracking, body-weight-movements, auth and profile.

This explains every previously-puzzling axis:

- **Full-vs-standalone / workers / ordering:** the error exists on every page
  load regardless of concurrency or spec order — it was never a parallelism
  race.
- **Source-axis "exoneration":** every source revert kept `src/start.ts` (or
  its client-loaded import chain) intact, so the failure survived them all.
- **Container-rebuild signal:** the failing state appeared right at the image
  rebuild coinciding with `1d27e09` — exactly when `src/start.ts` was
  introduced. T10-green (`e5b1233`) registered CSRF per-function via
  `.middleware([csrf])`, so nothing client-loaded imported `csrf.server.ts`
  then.
- **Module path signatures:** the client graph requested RAW `node_modules`
  paths with `?v=` fingerprints (`react-dom/server.browser.js`,
  `request-response.js`, `ssr/renderRouterToStream.js`) — those are the
  server render runtime being pulled into the client graph; `@tanstack/
  react-router-devtools`/`react-query-devtools` were exonerated (they are
  client-safe barrels in the transformed graph).

**Fix.** `src/lib/csrf.server.ts` now dynamically imports
`@tanstack/react-start/server` INSIDE the `.server()` handler, so it is never
resolved or fetched on the client (the `createMiddleware(...).server(cb)`
stub is client-safe). The `originMismatch(request, requestHost)` helper is
pure — host passed in; the dev-reset route performs the same Origin-vs-Host
check inline.

**Verification.** `bun run typecheck` — 0 errors. Full `bunx playwright test`
after a cold stack recycle (down → up → watch rebuild): **24 passed / 23
skipped**, twice consecutively (one earlier post-rebuild run showed two
transient body-weight flakes during Vite cold-start dep optimization; both
pass on rerun and in later full runs). Browser graph check: zero
`ssr/*`, `start-server-core`, `react-start-server` or
`react-dom/server.browser.js` requests in the client resource list, and zero
console errors on `/sign-in`.

**Left-over risks.**
- The dev-only shim for `tanstack-start-injected-head-scripts:v` in
  `vite.config.ts` stays: it guards a separate, rarer stale-transform race
  (virtual-module id resolved in the client env during dep re-optimization)
  unrelated to this root cause; removing it here requires a rebuild +
  revalidation.
  Invariant for future code: client-visible modules must never statically
  import `@tanstack/react-start/server` or any `*.server` barrel — reference
  server-only helpers only inside `.server()` handlers (matches upstream
  TanStack guidance, issues #6189/#5709).
