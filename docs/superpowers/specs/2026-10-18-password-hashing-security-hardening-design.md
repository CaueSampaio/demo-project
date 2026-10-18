# Password Hashing & Security Hardening — Design

**Date:** 2026-10-18
**Status:** Approved — builder check passed, partner answers incorporated (2026-10-18)
**Source:** `prompts/security-fix.md` + read-only security recon of this repo (2026-10-18)

## Why

The authentication system stores passwords in plaintext: `signInServerFn` compares the raw
string (`user.password !== password`, `src/lib/auth.server.ts` ~L90) and `createAccountServerFn`
persists it as received. Prisma's `User.password` is a plain `String`.

During recon, a strictly worse issue was found: `getServerConfigServerFn`
(`src/lib/get-server-config.server.ts`) returns the **entire** server config — including
`COOKIE_SECRET` and `DATABASE_URL` — over RPC to any browser. With `COOKIE_SECRET`, anyone can
forge valid session cookies for any user. The prompt explicitly requires "no secret leaks to the
client side (build nor runtime)".

Beyond these, the auth surface lacks standard hardening (rate limiting, CSRF, session hygiene)
and has several direct password-leak paths. This work fixes all of them and leaves a written
security-audit summary documenting residual risk. Scope was confirmed with the human partner:
**implement everything now** (no "report-only" items).

## Goals

1. **Password hashing** with `Bun.password.hash` / `Bun.password.verify`, algorithm **argon2id**
   (Bun's argon2 defaults are OWASP-aligned).
2. **No secret reaches the client** — build or runtime. `getServerConfigServerFn` exposes only
   public fields (e.g. `environment`).
3. **Every direct password-leak path removed.**
4. **Session hardening**: constant-time signature comparison, explicit cookie `path`, fresh
   token on sign-in, logout deletes the cookie with matching attributes.
5. **CSRF mitigation** for mutating server functions (origin check) and logout becomes a POST
   form, not a GET page load.
6. **Rate limiting** on unauthenticated auth endpoints (in-memory, per-IP).
7. **`authMiddleware` on `movements.server.ts`** fns (currently unauthenticated).
8. **Docker**: production stage runs as non-root; dead Auth0/documentParser template keys
   removed from `public/config.js`.
9. **Prisma**: `User.password` keeps its name and now stores the argon2id hash (no schema migration).
10. **e2e tests** covering the auth flows, including the mandatory **encrypt** (hash stored, not
    plaintext) and **verify** (correct password accepted, wrong rejected) use cases.
11. **Written security-audit summary** (`docs/security-audit-2026-10-18.md`): what was found,
    what was fixed, what remains.

## Non-goals / future work (documented in the audit summary, not built now)

- Server-side session revocation store (tokens remain stateless until 7-day expiry).
- Redis-backed / multi-instance rate limiting (current limiter is per-process, resets on restart).
- Full security-headers suite (CSP, HSTS, X-Frame-Options…) and CORS review.
- Anti-enumeration on `createAccountServerFn` ("account with this email already exists").
- Account lockout, password strength metering, MFA.
- CI plumbing cleanup beyond what's trivial (stale `workflow-ex.yml`, unused `github_token`
  secrets declarations — builder may delete `workflow-ex.yml` as trivial hygiene).

## Anti-goals (what would make this a failure even if it "works")

- Breaking existing passing e2e specs (`weight-tracking`, `body-weight-movements`).
- Breaking the Docker dev workflow (hot reload, USER_ID/GROUP_ID mapping, port 3000).
- Introducing any new plaintext-copy of a password (logs, error messages, client payloads).
- Rate limits so aggressive that normal use gets locked out.
- Weakening error messages' usefulness to the point of unusability (generic is fine; broken is not).

## Constraints

- Stack: TanStack Start (server functions via `createServerFn`), TanStack Router file-based
  routes, Prisma 7 with `@prisma/adapter-pg`, **Bun** runtime & package manager, Playwright e2e.
- Code structure per `CLAUDE.md`: server logic in `src/lib/*.server.ts`; server-only modules end
  in `.server.ts`; e2e tests in `e2e/`. `ast-grep` is available for structural searches.
- Runtime config flows through `src/lib/config.server.ts` (singleton) and
  `src/lib/config.client.ts` (public only).
- e2e suite assumes the Docker dev stack is already running (`baseURL http://localhost:3000`,
  no `webServer` in `playwright.config.ts`) — keep that pattern.
- **Runtime caution:** the e2e helpers (`e2e/helpers/auth.ts`) execute inside the Playwright
  runner (Node), where `Bun.password` is unavailable. Do not depend on Bun-only APIs there.
  The app server itself runs under Bun in both dev and prod once the dev-boot fix above lands —
  the caution applies only to the Playwright runner process.
  Prefer creating test users through the real sign-up flow (UI or HTTP call to the server
  function) so the hashing path is exercised end-to-end; direct-DB inserts stay acceptable only
  for plaintext-legacy fixtures (which need no hashing).
- Legacy data: existing dev-DB users hold plaintext passwords. `Bun.password.verify` fails on
  non-hash strings, so sign-in must detect a legacy row (stored value does **not** start with
  `$`), fall back to plaintext comparison, and on success rehash + persist the new hash
  (lazy migration). No one-off backfill script.

## Decisions made with the human partner

| Decision | Choice |
|---|---|
| Hash algorithm | argon2id via `Bun.password.hash` (Bun defaults) |
| Legacy plaintext rows | Lazy migration inside sign-in (detect → compare → rehash → update) |
| Prisma field | Keep the name `password` (partner decision, 2026-10-18); it stores the argon2id hash; no migration |
| Rate limits | In-memory fixed window per IP: sign-in ~5/min, create-account ~3/min (exact numbers tunable) |
| CSRF | Origin-check middleware on mutating server fns; keep `sameSite=lax`; `/logout` → POST form |
| Session | `timingSafeEqual` compare; `path: "/"`; re-set cookie with fresh 7-day expiry on sign-in — **no token-format change** (deterministic HMAC stays; rotation-by-nonce only makes sense with the future revocation store); logout deletes with matching attrs |
| Docker | `USER appuser` in production stage; strip dead `${VITE_AUTH0_*}` / documentParser keys from `public/config.js` |
| Docs | Correct `CLAUDE.md` auth description (credential-based, not Auth0); remove unused `@auth0/auth0-react` dependency |
| Dev runtime | Dev stack boots Vite under Bun (`bun --bun vite dev` in the Dockerfile dev CMD / dev script) so `Bun.password` exists in dev; implementer verifies this early and escalates if Bun-under-Vite proves incompatible |
| Deployments | Dev-only (partner-confirmed): no non-dev instance with user rows; no schema migration involved |
| Dead runtime-config mechanism | Delete `public/config.js` and its `<script>` include in `__root.tsx`; rely on build-time `VITE_ENVIRONMENT` via `config.client.ts` fallback (mechanism never worked — see Finding 14) |
| Security headers / CSP | Future work (documented) |

## What is left to the builder

- Rate-limiter utility shape and home (suggest `src/lib/rate-limit.server.ts`); how to obtain
  the client IP inside a TanStack Start server function (request headers / `getWebRequest`,
  `X-Forwarded-For` handling, safe fallback key).
- How the origin-check middleware composes with existing TanStack Start middleware
  (`createMiddleware({ type: "function" })`) and which fns count as "mutating".
- Whether `getServerConfigServerFn` stays (returning only public fields) or is deleted; fix its
  consumers (`__root.tsx` beforeLoad calls it and discards the result; `db.server.ts` obtains
  `DATABASE_URL` via it — refactor to read `configService` directly).
- Zod password bounds (suggest `min(6).max(128)` — add explicit max for DoS safety).
- Structure/wording of `docs/security-audit-2026-10-18.md`.
- e2e spec organization for `e2e/auth.spec.ts` (sign-up, sign-in, wrong-password, rate-limit,
  logout, legacy-row migration). Rate-limit test must not destabilize other tests (unique IPs
  aren't available — consider a high-limit-vs-test-count design or resetting state via a test
  hook; builder's call).

## Findings inventory (recon 2026-10-18 — builder verifies each before fixing)

1. `src/lib/auth.server.ts` L80–97 `signInServerFn`: plaintext comparison; sets session cookie.
2. `src/lib/auth.server.ts` L102–124 `createAccountServerFn`: stores plaintext; reveals
   existing emails (anti-enumeration is future work; do not regress UX otherwise).
3. `src/lib/auth.server.ts` L58–75 `getUserServerFn`: returns full user row incl. password into
   router context → select only `id, email, name, createdAt`.
4. `src/lib/auth.server.ts` L17–20 / L30: HMAC sign/verify, non-constant-time compare.
5. `src/routes/sign-in.tsx` L11–17: `getAllUsersServerFn` dumps users incl. plaintext passwords
   (gated only by "not production") + dev-gated button L105–117 → **delete both**.
6. `src/routes/create-account.tsx` L31: `console.log` of plaintext password → delete.
7. `src/lib/get-server-config.server.ts` L4–9: returns `cookieSecret` + `database.url` to any
   caller → **critical**.
8. `src/lib/db.server.ts` L12: obtains `DATABASE_URL` by calling the leaking server fn.
9. `prisma/schema.prisma` L10–19: `password String` — field name stays (partner decision); its content
   becomes the argon2id hash. No migration needed.
10. `src/lib/movements.server.ts`: no `authMiddleware` (unlike `weight.server.ts`,
    `workouts.server.ts`).
11. `src/routes/logout.tsx`: GET page-load logout (logout-CSRF-prone) → POST form.
12. Cookie delete in logout may not match set-attributes (verify `path`).
13. `Dockerfile`: `appuser` created (L7–9) but **no `USER` directive** anywhere.
14. `public/config.js`: the entire runtime-config mechanism is dead — `entry.sh` never calls
    `envsubst`, so even `${VITE_ENVIRONMENT}` ships as a literal string (truthy, so
    `config.client.ts`'s import.meta.env fallback never fires); Auth0/documentParser keys are
    also dead. Resolution: delete the mechanism (see Decisions).
15. `CLAUDE.md` L45: says "Auth0-based authentication" — stale; code is credential-based;
    `@auth0/auth0-react` unused in `package.json`.
16. `e2e/helpers/auth.ts`: `createTestUser` inserts plaintext user; session forging
    (`sessionCookieFor`) stays valid post-change (doesn't touch passwords); users never cleaned
    up (acceptable — document in audit summary).
17. No rate limiting / CSRF / security headers anywhere (repo-wide grep).
18. `docker-compose.dev.yml`: hardcoded dev creds `postgres/postgres` (acceptable for dev;
    document).

## Definition of Done

- Passwords stored only as argon2id hashes in the database; sign-up hashes; sign-in verifies
  (and lazily migrates legacy rows).
- No secret (`COOKIE_SECRET`, `DATABASE_URL`) reachable from the client, build or runtime.
- All direct password-leak paths (§ Findings 3, 5, 6) removed.
- Session compare constant-time; logout POST + clean cookie delete.
- Origin-check CSRF middleware active on mutating server fns; rate limits active on sign-in and
  create-account.
- `movements.server.ts` fns require auth.
- Production Docker stage runs non-root; `public/config.js` has no dead template keys.
- Prisma field `password` stores only argon2id hashes; app + e2e helpers updated (no schema migration).
- e2e `auth.spec.ts` covers: hash-stored-not-plaintext (**encrypt use case — mandatory**),
  correct-password accepted / wrong rejected (**verify use case — mandatory**), rate limiting,
  logout, legacy-row lazy migration. Full suite passes; `bun run typecheck` passes.
- `docs/security-audit-2026-10-18.md` written (findings, fixes, residual risks incl. future work).
- `CLAUDE.md` auth section corrected.
- Dev stack boots under Bun so `Bun.password` is available in every environment (dev, prod, e2e).
- No dead runtime-config remnants: `public/config.js` removed, `window.APP_CONFIG` references gone.
