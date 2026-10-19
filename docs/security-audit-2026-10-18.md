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
| 17 | No rate limiting / CSRF / security headers anywhere | CSRF uses TanStack Start's **native** `createCsrfMiddleware` (framework `@tanstack/react-start@1.168.61`; native since 1.168.0), registered **once** on `requestMiddleware` in `src/start.ts` with `filter: (ctx) => ctx.handlerType === "serverFn"`, so it covers every server function; the hand-rolled `src/lib/csrf.server.ts` is deleted; the dev-only `/api/dev-reset-rate-limits` route (not a server fn) installs the same middleware itself. Per-IP in-memory fixed-window limiter (sign-in 5/min, create-account 3/min; XFF trusted for keying **only** when `TRUST_PROXY=1`; expired buckets evicted with a 10k-entry soft cap) — headers remain future work | `3c92758` (T6), `4b0a6d9` (T7), this pass (native CSRF) |
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
| `resetRateLimitsServerFn` lacked `csrfMiddleware` (dev-only endpoint, but a POST server fn) | Now a file route (`/api/dev-reset-rate-limits`, not a server fn); it installs TanStack Start's native CSRF middleware directly (the global middleware's `serverFn` filter skips routes) |

**Residual note (superseded):** the earlier `9 failed / 23 skipped` dev-run attribution to rate-limit bucket races is withdrawn — see the Resolution addendum below, which is authoritative: those failures were the `src/start.ts` server-import root cause, since fixed (suite 24-passed twice).

### CSRF: native framework middleware

CSRF is handled by TanStack Start's built-in `createCsrfMiddleware`, not by app code. The
hand-rolled `src/lib/csrf.server.ts` (Origin-vs-Host check + `originMismatch` helper) was
deleted. Because this app ships a custom Start entry (`src/start.ts`), Start does **not**
auto-install the middleware; it is registered explicitly on `requestMiddleware`:

```ts
import { createCsrfMiddleware, createStart } from "@tanstack/react-start";

export const startInstance = createStart(() => ({
  requestMiddleware: [
    createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" }),
  ],
}));
```

- `requestMiddleware` runs before every request (server routes, SSR and server functions); the
  `filter` narrows validation to server functions (the same-origin RPC surface).
- Validation trusts `Sec-Fetch-Site` first, then `Origin`, then `Referer`. The strict default is
  kept: a request carrying none of those headers is rejected (403). We do **not** set
  `allowRequestsWithoutOriginCheck`.
- The dev-only `/api/dev-reset-rate-limits` route is a *file route*, not a server function, so
  the global filter skips it; it installs `createCsrfMiddleware()` itself (and the e2e reset
  hook now sends an explicit same-origin `Origin` header).

**Historical note (superseded design).** An earlier revision registered a hand-rolled
`csrfMiddleware` as global *function* middleware via `createStart(() => ({ functionMiddleware:
[csrfMiddleware] }))`. That approach was replaced by the native request middleware above; the
`functionMiddleware` field is no longer used. The earlier per-fn `.middleware([csrfMiddleware])`
attachments had already been removed in the global-registration refactor.

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
- ~~The dev-only shim for `tanstack-start-injected-head-scripts:v` in
  `vite.config.ts` stays~~ **Removed in the 1.168.61 upgrade addendum below**:
  the `tanstack-start-injected-head-scripts:v` virtual module no longer exists
  upstream (the mechanism was replaced by `virtual:tanstack-start-dev-client-entry`),
  so the shim had become a no-op.
  Invariant for future code: client-visible modules must never statically
  import `@tanstack/react-start/server` or any `*.server` barrel — reference
  server-only helpers only inside `.server()` handlers (matches upstream
  TanStack guidance, issues #6189/#5709).

## Upgrade addendum: TanStack fleet → 1.168.61 + native CSRF

**Target version.** `createCsrfMiddleware` is exported from `@tanstack/react-start` since
**1.168.0** (the middleware itself landed upstream in `start-plugin-core@1.170.0`,
PR [#7373](https://github.com/TanStack/router/pull/7373)). The **latest** release
(`1.169.3`) is **not** usable here: from **1.169.0** Start requires **Vite 8** (this repo is on
Vite 7.3.1) and removes the built-in `useSession` API. The newest release that both exports the
native middleware and supports Vite 7 is **`@tanstack/react-start@1.168.61`**, so that is the
target. The installed `1.150.0` has zero `createCsrfMiddleware` matches (verified in
`node_modules`).

**Pinning.** All `@tanstack/*` dependencies in `package.json` were changed from caret ranges to
**exact** versions (root cause of the earlier fleet drift: a bare `bun install` re-resolved the
1.139→1.150 fleet mid-session). The router/start fleet resolves to:

| Package | Version |
|---|---|
| `@tanstack/react-start` | `1.168.61` |
| `@tanstack/react-router` | `1.170.42` |
| `@tanstack/react-router-devtools` | `1.167.2` |
| `@tanstack/react-router-ssr-query` | `1.167.3` |
| `@tanstack/router-plugin` | `1.168.43` |
| `@tanstack/router-cli` | `1.167.45` |
| `@tanstack/nitro-v2-vite-plugin` | `1.155.2` |
| `@tanstack/react-query` / `-devtools` | `5.104.4` |
| `@tanstack/react-form` / `react-devtools` / `charts` | `1.27.7` / `0.9.2` / `1.1.0` (unchanged) |

`@tanstack/react-query` was bumped `5.90.18 → 5.104.4` because `react-router-ssr-query@1.167.3`
declares a `>=5.102.0` peer. `react`/`react-dom` (19.2.3) and `vite` (7.3.1) are unchanged and
satisfy the `1.168.61` peers (`react >=18||>=19`, `vite >=7`). The lockfile diff touches only
the TanStack/nitro dependency subtree (new transitive deps such as the Solid/Vue support
packages pulled in by `router-plugin`); no direct non-TanStack dependency drifted.

**Two upgrade-induced fixes (beyond the CSRF migration):**

1. **`import-protection` filename rules break our (pre-existing) module layout.** The upgrade
   ships Start's import-protection plugin, whose default *filename* rules mock `**/*.server.*`
   imports in the client and error on `**/*.client.*` imports in the server. The first made every
   server-fn call throw `[import-protection] Mocked import used in dev client` in dev (forms
   silently stopped working — inputs never updated React state); the second failed the production
   build (`src/routes/__root.tsx` → `config.client.ts` in the SSR graph). `vite.config.ts` now
   sets `importProtection: { client: { files: [] }, server: { files: [] } }`. The more important
   *specifier* guards (`@tanstack/*-start/server` out of client code, `@tanstack/*-start/client*`
   out of server code) are always merged with the defaults and stay active. The framework's
   documented layout (`.functions.ts` for `createServerFn` wrappers, `.server.ts` for helpers;
   client-only modules never imported by SSR) is the proper long-term fix and is tracked as
   future work.
2. **Devtools hydration mismatch.** `<TanStackDevtools>` renders a positioned container on the
   client but nothing during SSR; with the new manifest the container occupied the slot of the
   SSR-injected `virtual:tanstack-start-dev-client-entry` script and React aborted hydration,
   leaving form handlers unattached. `src/routes/__root.tsx` now renders the devtools only after
   mount (`useState`/`useEffect`), which is the standard client-only pattern and keeps server and
   first-client render in agreement.

**Verification (final state, Docker dev stack rebuilt on the new versions):**

```
$ bun run typecheck           # 0 errors
$ bun run build               # production build succeeds (exit 0)
$ bunx playwright test        # 24 passed / 23 skipped, twice consecutively, exit 0

POST /api/dev-reset-rate-limits
  Origin: https://evil.example -> 403
  Origin: http://localhost:3000 -> 200
  (no Origin/Sec-Fetch-Site/Referer) -> 403

GET /  -> 307 -> /current-workout -> 307 -> /sign-in (200, no console errors)
```

Container confirmed on the new fleet (`bun pm ls`: `@tanstack/react-start@1.168.61`,
`@tanstack/react-router@1.170.42`); no `does not provide an export named 'default'`,
virtual-module or import-protection errors in the app logs.

**e2e adaptations.** The reset hook (`e2e/auth.spec.ts` `beforeEach`) now sends an explicit
same-origin `Origin: http://localhost:3000` header (Playwright's `request` client sends none,
and the endpoint's native middleware rejects header-less requests). The `cross-origin POST is
rejected` test re-targets the server-fn POST at `127.0.0.1:3000` instead of `localhost:3000` so
the browser computes `Sec-Fetch-Site: cross-site` — the native middleware trusts that header
before `Origin`, and a forged `Origin` alone (with an unchanged same-origin `Sec-Fetch-Site`) is
ignored.
