# Password Hashing & Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store passwords only as argon2id hashes, close the server-config secret leak and every direct password-disclosure path, and add session/CSRF/rate-limit hardening with e2e coverage.

**Architecture:** New server-only libs (`password.server.ts`, `csrf.server.ts`, `rate-limit.server.ts`) wrap Bun's argon2id hashing, origin checking, and per-IP fixed-window limiting; `auth.server.ts` is rewired to hash on sign-up, verify (+ lazily migrate legacy rows) on sign-in, and stop returning password fields; the leaking config endpoint, dead runtime-config file, and plaintext-logging paths are deleted; Docker boots dev under Bun and drops root in production; Playwright e2e covers the whole surface.

**Tech Stack:** Bun 1.3 (`Bun.password`), TanStack Start server functions + middleware, Prisma 7 (Postgres), Playwright (chromium).

**Spec:** `docs/superpowers/specs/2026-10-18-password-hashing-security-hardening-design.md` (read it first — it carries the 18 findings inventory with file:line refs and all partner decisions).

## Global Constraints

- Runtime & package manager: **Bun**. All hashing via `Bun.password.hash` / `Bun.password.verify`, algorithm `argon2id`, Bun default params. No other hashing library anywhere.
- Server-only code lives in `src/lib/*.server.ts` (CLAUDE.md structure). Never import a `.server.ts` module from client-reachable code paths that run under Node.
- No plaintext password may appear in logs, error messages, or server-fn return values.
- Session cookie attrs stay: `httpOnly: true`, `secure: environment !== "development"`, `sameSite: "lax"`, expiry 7 days; add explicit `path: "/"`.
- Rate limits (fixed window, per IP): sign-in 5/min, create-account 3/min. The reset hook must throw in production.
- e2e helpers run under the **Node** Playwright runner — no `Bun.*` APIs in `e2e/`.
- DB is dev-only (partner-confirmed): migrations need no deploy coordination.
- After every task: `bun run typecheck` passes; commit with the exact conventional-commit message given in the task.
- The Docker dev stack (`bun run dev`, port 3000) must keep hot reload, USER_ID/GROUP_ID mapping and port mapping working.

## Review Focus

The five inputs most likely to bite a person using this software, each pinned by a test in Task 10:

1. A password containing `$`, spaces, unicode, or emoji must round-trip sign-up → sign-in (pinned: `password with special characters round-trips`).
2. A cross-origin POST with a forged `Origin` header must be rejected (403) and must not create a session (pinned: `cross-origin POST is rejected`).
3. The 6th sign-in attempt within one minute from one IP must get a generic "Too many attempts" error, and limits must reset cleanly afterwards (pinned: `6th sign-in attempt in a minute is rate limited`).
4. A pre-existing plaintext password row must still sign in and be lazily migrated to `$argon2id$` (pinned: `legacy plaintext row is lazily migrated on sign-in`).
5. An unauthenticated call to a movements server function / movements page must not return data (redirect to `/sign-in`) (pinned: `movements require authentication`).

---

### Task 1: Argon2id password helpers

**Files:**
- Create: `src/lib/password.server.ts`

**Interfaces:**
- Consumes: `Bun.password` (runtime).
- Produces (Tasks 3+):
  - `export function isPasswordHash(value: string): boolean` — true iff `value.startsWith("$")`
  - `export async function hashPassword(password: string): Promise<string>` — `Bun.password.hash(password, { algorithm: "argon2id" })`
  - `export async function verifyPassword(password: string, hash: string): Promise<boolean>` — `Bun.password.verify(password, hash)`; return `false` on any error

- [ ] **Step 1: Create `src/lib/password.server.ts`**

```ts
const ARGON2ID = { algorithm: "argon2id" } as const;

export function isPasswordHash(value: string): boolean {
  return value.startsWith("$");
}

export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, ARGON2ID);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await Bun.password.verify(password, hash);
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Smoke-verify in the Bun runtime**

Run: `bun -e 'import("./src/lib/password.server.ts").then(async (m) => { const h = await m.hashPassword("s3cret-$tuff é🎉"); console.log(m.isPasswordHash(h), m.isPasswordHash("plaintext"), await m.verifyPassword("s3cret-$tuff é🎉", h), await m.verifyPassword("wrong", h)); })'`
Expected output: `true false true false`

- [ ] **Step 3: Commit**

```bash
git add src/lib/password.server.ts
git commit -m "feat: add argon2id password hashing helpers"
```

### Task 2: Remove direct password-disclosure paths

**Files:**
- Modify: `src/routes/sign-in.tsx:11-17` (delete `getAllUsersServerFn`) and `:105-117` (delete the dev-only button that calls it) — remove now-unused imports (`getServerSidePrismaClient`/`configService`) it leaves behind
- Modify: `src/routes/create-account.tsx:31` — delete the `console.log("Creating account", …)` line

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: sign-in route with no users-dump server fn; no code path logs a password.

- [ ] **Step 1: Make the two deletions above** (exact locations per the spec's Findings 5–6; if lines drifted, locate by `getAllUsersServerFn` and `console.log("Creating account"`).
- [ ] **Step 2: Verify**

Run: `grep -rn "getAllUsersServerFn\|console.log(\"Creating account\"" src/ ; bun run typecheck`
Expected: grep finds nothing; typecheck passes.

- [ ] **Step 3: Commit**

```bash
git add src/routes/sign-in.tsx src/routes/create-account.tsx
git commit -m "fix: remove direct password disclosure paths"
```

### Task 3: Prisma rename + hash on sign-up, verify (+lazy migrate) on sign-in

**Files:**
- Modify: `prisma/schema.prisma:10-19` — `User.password` → `User.passwordHash` (`String`, unchanged rest)
- Create: `prisma/migrations/<timestamp>_rename_user_password_to_password_hash/migration.sql`
- Modify: `src/lib/auth.server.ts` (sign-in, sign-up, getUser; imports)
- Modify: `e2e/helpers/auth.ts` — `createTestUser` inserts `passwordHash: E2E_TEST_PASSWORD_HASH` instead of plaintext `password`

**Interfaces:**
- Consumes: `hashPassword`, `verifyPassword`, `isPasswordHash` from `./password.server` (Task 1).
- Produces:
  - `export const E2E_TEST_PASSWORD_HASH = "$argon2id$v=19$m=65536,t=2,p=1$5BE8E974lmIJ/giXJ3V8tq6/WBr7x5E4CWRbShve+cE$AKtw6jCqwG//EI70+DQlS9OXIXHIP/NZuBIOXxs8OZQ"` in `e2e/helpers/auth.ts` (argon2id of `"e2test-password"`); `createTestUser(password = "e2test-password")` keeps its signature but `throw new Error("custom passwords unsupported — use the sign-up UI flow")` when `password !== "e2test-password"`; update its callers if they pass custom passwords.
  - `User.passwordHash` in Prisma; `getUserServerFn` returns `{ id, email, name, createdAt } | null` (no password fields).

- [ ] **Step 1: Edit schema.prisma** — rename the field to `passwordHash` (the model's only change).
- [ ] **Step 2: Create the migration with dev DB up** (`bun run dev` stack running, or `DATABASE_URL` to a local Postgres)

Run: `bunx prisma migrate dev --create-only --name rename_user_password_to_password_hash`
Edit the generated `migration.sql` to contain exactly:

```sql
-- Prisma generates DROP+ADD for unknown renames; replace with a true rename:
ALTER TABLE "User" RENAME COLUMN "password" TO "passwordHash";
```

Run: `bunx prisma migrate dev && bun run generate`
Expected: migration applied; client regenerated with `passwordHash`.

- [ ] **Step 3: Rewire `src/lib/auth.server.ts`**

- `import { hashPassword, isPasswordHash, verifyPassword } from "./password.server";`
- `signInServerFn` handler: look up user by email; valid = if user exists and `isPasswordHash(user.passwordHash)` → `await verifyPassword(password, user.passwordHash)`; else if user exists (legacy plaintext) → `password === user.passwordHash` via the constant-time compare added in Task 5 (`constantTimeEqual`, plain `===` acceptable for now, Task 5 replaces it); on legacy success: `await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } })`. If `!user || !valid` → return `{ success: false as const, error: "Invalid email or password" }`; then `setSessionCookie(user.id)`, return success.
- `createAccountServerFn`: `data: { email, name, passwordHash: await hashPassword(password) }`; zod password becomes `z.string().min(6).max(128)`; signIn zod password becomes `z.string().min(1).max(128)`.
- `getUserServerFn`: `prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, createdAt: true } })`.

- [ ] **Step 4: Update `e2e/helpers/auth.ts`** — add `E2E_TEST_PASSWORD_HASH` const (exact string above), insert `passwordHash: E2E_TEST_PASSWORD_HASH`, add the custom-password throw.
- [ ] **Step 5: Verify**

Run: `grep -rn "passwordHash\|\.password\b" src/ e2e/ --include="*.ts*" | grep -v passwordHash | grep -v "\.password\b" ; bun run typecheck`
Expected: typecheck passes; no remaining `password: true` selects or plaintext inserts.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/auth.server.ts e2e/helpers/auth.ts
git commit -m "feat: hash passwords in sign-up and sign-in flows"
```

### Task 4: Close the server-config secret leak + dead runtime config

**Files:**
- Delete: `src/lib/get-server-config.server.ts`
- Modify: `src/lib/db.server.ts:12` — replace the `getServerConfigServerFn` call with a direct import: `import { configService } from "./config.server";` and read `configService.getAppConfig().database.url`
- Modify: `src/routes/__root.tsx` — remove the `getServerConfigServerFn` call in `beforeLoad` (L115–119) and the `public/config.js` `<script>` include (L136–139), plus now-unused imports
- Delete: `public/config.js`

**Interfaces:**
- Consumes: `configService.getAppConfig()` (existing).
- Produces: no server fn or client file exposes `cookieSecret`/`DATABASE_URL`; `config.client.ts` falls through to build-time `VITE_ENVIRONMENT` (its import.meta.env branch).

- [ ] **Step 1: Make the deletions/edits.** If any other file imports `get-server-config` or `window.APP_CONFIG`, fix the import to `config.client` / build-time env.
- [ ] **Step 2: Verify**

Run: `grep -rn "getServerConfig\|APP_CONFIG\|cookieSecret" src/ public/ ; bun run typecheck`
Expected: grep shows `cookieSecret` only inside `src/lib/config.server.ts` (and `config.client.ts` matches none of the three); typecheck passes.

- [ ] **Step 3: Commit**

```bash
git add -A src/ public/
git commit -m "fix: stop leaking secrets through server config endpoint"
```

### Task 5: Session hardening

**Files:**
- Modify: `src/lib/auth.server.ts`

**Interfaces:**
- Consumes: `node:crypto` (already imported).
- Produces: `function constantTimeEqual(a: string, b: string): boolean` (module-private); signInServerFn's legacy branch now uses it.

- [ ] **Step 1: Add and use the helpers**

```ts
function constantTimeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}
```

Replace the legacy branch's `===` from Task 3 with `constantTimeEqual(password, user.passwordHash)`. Add `path: "/"` to the `setCookie` options object (L42–51). Update `logoutServerFn` to `deleteCookie(sessionCookieName, { path: "/" })` (same attributes as set, minus value/expiry).

- [ ] **Step 2: Verify**

Run: `bun run typecheck && grep -n "timingSafeEqual\|path: \"/\"" src/lib/auth.server.ts`
Expected: typecheck passes; both hits present.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth.server.ts
git commit -m "fix: harden session cookie handling"
```

### Task 6: CSRF origin-check middleware + logout as POST form

**Files:**
- Create: `src/lib/csrf.server.ts`
- Modify: `src/lib/auth.server.ts`, `src/lib/workouts.server.ts`, `src/lib/weight.server.ts`, `src/lib/movements.server.ts` — attach `.middleware([csrfMiddleware])` to every `createServerFn({ method: "POST" })` (auth: signIn/createAccount/logout; workouts: all 7; weight: all 4; movements: both — keep existing `authMiddleware` composition, csrf first)
- Modify: `src/routes/logout.tsx` — replace the `useEffect` auto-call (L12–16) with a `<form method="post">` whose submit calls `logoutServerFn()` (user-initiated), then navigates to `/sign-in`

**Interfaces:**
- Consumes: `getRequest`, `getRequestHeader`, `getRequestHost` from `@tanstack/react-start/server` (verified exports).
- Produces: `export const csrfMiddleware` — `createMiddleware({ type: "function" }).server(...)`.

- [ ] **Step 1: Create `src/lib/csrf.server.ts`**

```ts
import { createMiddleware } from "@tanstack/react-start";
import { getRequest, getRequestHeader, getRequestHost } from "@tanstack/react-start/server";

export const csrfMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const request = getRequest();
  if (request.method !== "GET") {
    const origin = getRequestHeader("origin");
    if (origin && new URL(origin).host !== getRequestHost()) {
      throw new Response("Forbidden", { status: 403 });
    }
  }
  return next();
});
```

If `throw new Response(...)` fails typecheck in middleware position, short-circuit by returning `new Response("Forbidden", { status: 403 })` directly instead of calling `next()` — one mechanism, chosen by what the installed types allow.

- [ ] **Step 2: Attach middleware to all POST server fns** (per file list above).
- [ ] **Step 3: Convert `/logout` to a POST form** (submit handler calls `logoutServerFn` then `navigate({ to: "/sign-in" })`).
- [ ] **Step 4: Verify**

Run: `bun run typecheck && grep -rn "csrfMiddleware" src/lib/ | wc -l`
Expected: typecheck passes; ≥ 17 attachment sites (16 POST fns + the definition).

- [ ] **Step 5: Commit**

```bash
git add src/lib/csrf.server.ts src/lib/auth.server.ts src/lib/workouts.server.ts src/lib/weight.server.ts src/lib/movements.server.ts src/routes/logout.tsx
git commit -m "feat: add origin-check CSRF middleware for server functions"
```

### Task 7: Rate limiting on unauthenticated auth endpoints

**Files:**
- Create: `src/lib/rate-limit.server.ts`
- Create: `src/routes/api/dev-reset-rate-limits.ts` (dev-gated reset hook)
- Modify: `src/lib/auth.server.ts` — signIn/createAccount call the limiter first

**Interfaces:**
- Consumes: `getRequestIP({ xForwardedFor: true })` from `@tanstack/react-start/server`; `configService` for the environment check.
- Produces:
  - `type RateLimitBucket = "signIn" | "createAccount"`; `const RATE_LIMITS: Record<RateLimitBucket, { limit: number; windowMs: number }> = { signIn: { limit: 5, windowMs: 60_000 }, createAccount: { limit: 3, windowMs: 60_000 } }`
  - `export function checkRateLimit(bucket: RateLimitBucket, ip: string): { allowed: boolean; retryAfterSeconds: number }` — in-memory fixed window keyed `${bucket}:${ip}`
  - `export const resetRateLimitsServerFn` — clears the bucket map; throws when `environment === "production"`

- [ ] **Step 1: Create `src/lib/rate-limit.server.ts`**

```ts
const buckets = new Map<string, { count: number; windowStart: number }>();

export function checkRateLimit(bucket: RateLimitBucket, ip: string): { allowed: boolean; retryAfterSeconds: number } {
  const { limit, windowMs } = RATE_LIMITS[bucket];
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now - entry.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  entry.count += 1;
  if (entry.count > limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((entry.windowStart + windowMs - now) / 1000) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}
```

Plus `export function resetRateLimits() { buckets.clear(); }`, `getClientIp()` (`getRequestIP({ xForwardedFor: true }) ?? "unknown"`), and `resetRateLimitsServerFn` (createServerFn whose handler throws in production, else calls `resetRateLimits()`).

- [ ] **Step 2: Create `src/routes/api/dev-reset-rate-limits.ts`** — POST handler returning JSON `{ ok: true }` after calling `resetRateLimits()`; respond 403 when `configService.getAppConfig().environment === "production"` (mirror `src/routes/api/health.ts` structure).

- [ ] **Step 3: Apply in auth.server.ts** — at the top of `signInServerFn` and `createAccountServerFn` handlers: `const rl = checkRateLimit("<bucket>", getClientIp()); if (!rl.allowed) return { success: false as const, error: "Too many attempts. Try again shortly." };`

- [ ] **Step 4: Verify**

Run: `bun run typecheck`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rate-limit.server.ts src/routes/api/dev-reset-rate-limits.ts src/lib/auth.server.ts
git commit -m "feat: rate-limit unauthenticated auth endpoints"
```

### Task 8: Require auth on movements server functions

**Files:**
- Modify: `src/lib/movements.server.ts` — add `.middleware([authMiddleware, csrfMiddleware])` to `getMovementsServerFn` and `createMovementServerFn` (imports per existing `weight.server.ts` pattern)

**Interfaces:**
- Consumes: `authMiddleware` (`src/lib/auth.server.ts`), `csrfMiddleware` (Task 6).
- Produces: no unauthenticated server fn remains in `src/lib/`.

- [ ] **Step 1: Attach middlewares.**
- [ ] **Step 2: Verify**

Run: `bun run typecheck && grep -rn "authMiddleware" src/lib/movements.server.ts`
Expected: typecheck passes; 2 attachment sites.

- [ ] **Step 3: Commit**

```bash
git add src/lib/movements.server.ts
git commit -m "fix: require auth on movements server functions"
```

### Task 9: Docker — dev under Bun, production non-root

**Files:**
- Modify: `Dockerfile` — dev-stage `CMD` runs Vite under Bun: `CMD ["bun", "--bun", "vite", "dev", ...]` (keep any existing extra args, e.g. `--host`); add `USER appuser` to the production stage after the final COPY/chown. If `docker-compose.dev.yml` overrides `command:`, apply the same `bun --bun vite dev` change there.

**Interfaces:**
- Consumes: existing `imbios/bun-node` image (contains both bun and node; `vite` bin shebang is node — hence the explicit `bun --bun`).
- Produces: dev server functions execute under the Bun runtime; production image defaults to non-root.

- [ ] **Step 1: Edit the Dockerfile (and compose command override if present).**
- [ ] **Step 2: Boot smoke**

Run: `bun run dev:down ; bun run dev` then wait for port 3000, `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health`
Expected: `200`.

- [ ] **Step 3: Commit**

```bash
git add Dockerfile docker-compose.dev.yml
git commit -m "fix: run dev under bun and drop root in production image"
```

### Task 10: e2e auth coverage (encrypt + verify use cases, hardening)

**Files:**
- Test: `e2e/auth.spec.ts` (create)

**Interfaces:**
- Consumes: `createTestUser`, `testPrisma`, `sessionCookieFor` from `./helpers/auth` (existing, updated in Task 3); dev stack running from Task 9.
- Produces: the five Review-Focus tests plus core flow coverage.

- [ ] **Step 1: Write `e2e/auth.spec.ts`** with `test.beforeEach` POSTing `${baseURL}/api/dev-reset-rate-limits` (expect 200) and using a unique `user+Date.now()@e2e.test` per test. Tests, with exact assertions:

1. `sign-up stores an argon2id hash, never the plaintext` (**encrypt use case — mandatory**) — UI `/create-account` with email/name/password → sign-in screen or app reached; `testPrisma.user.findUnique` on the email → `expect(user.passwordHash).toMatch(/^\$argon2id\$/)` and `expect(user.passwordHash).not.toBe(password)`.
2. `sign-in accepts the correct password` (**verify use case — mandatory**) — `createTestUser({ email })` → UI `/sign-in` with `"e2test-password"` → app content visible (redirected off `/sign-in`).
3. `sign-in rejects a wrong password with a generic error` — wrong password → `"Invalid email or password"` visible; still on `/sign-in`.
4. `legacy plaintext row is lazily migrated on sign-in` — `testPrisma.user.create` with `passwordHash: "legacy-plaintext"` → UI sign-in succeeds → DB row `passwordHash` matches `/^\$argon2id\$/`.
5. `password with special characters round-trips` — sign-up with `P@$$w0rd é🎉 & $ymbols` → logout → sign-in OK.
6. `6th sign-in attempt in a minute is rate limited` — reset → 6 UI sign-in attempts (wrong password, same email) → attempt 6 shows `"Too many attempts. Try again shortly."` (allow it from attempt 6 onward, not earlier).
7. `cross-origin POST is rejected` — `page.route("**/*", route => route.continue({ headers: { ...route.request().headers(), origin: "https://evil.example" } }))` → UI sign-in attempt fails (error visible / no navigation into app) and `context.cookies()` contains no `session` cookie.
8. `logout clears the session` — `createTestUser` + `context.addCookies` forged `session` cookie (value `sessionCookieFor(userId)`, name `"session"`, domain `localhost`, path `/`) → app reachable → submit the logout form → redirected to `/sign-in` and `session` cookie gone.
9. `movements require authentication` — without a session, request the movements page URL (see `src/routes/` for the exact path) → redirected to `/sign-in`.

- [ ] **Step 2: Run the new spec**

Run: `bunx playwright test e2e/auth.spec.ts`
Expected: 9 passed.

- [ ] **Step 3: Run the whole suite + typecheck**

Run: `bunx playwright test && bun run typecheck`
Expected: all specs pass (including `weight-tracking`, `body-weight-movements`); typecheck passes.

- [ ] **Step 4: Commit**

```bash
git add e2e/auth.spec.ts
git commit -m "test: add e2e auth coverage for hashing, verification and hardening"
```

### Task 11: Security audit summary + docs/dependency cleanup

**Files:**
- Create: `docs/security-audit-2026-10-18.md`
- Modify: `CLAUDE.md:45` — auth description becomes "credential-based authentication (argon2id password hashing, HMAC-signed session cookie)" plus the new server fns (`rate-limit.server.ts`, `csrf.server.ts`, `password.server.ts`) in the structure list
- Modify: `package.json` — remove `@auth0/auth0-react`; run `bun install` to sync the lockfile
- Delete: `.github/workflows/workflow-ex.yml`

**Interfaces:**
- Consumes: spec design doc (findings inventory, non-goals).
- Produces: the DoD's "bigger picture" deliverable.

- [ ] **Step 1: Write `docs/security-audit-2026-10-18.md`** with exactly these sections: (1) *Findings & resolutions* — table of the 18 findings from the spec with status (fixed in this pass, with commit/task reference); (2) *Deferred / future work* — session revocation store, Redis-backed rate limiting, security headers (CSP/HSTS/X-Frame-Options), anti-enumeration on create-account, account lockout/MFA, CI plumbing cleanup; (3) *Deployment notes* — DB is dev-only (partner-confirmed 2026-10-18), column rename needs no deploy coordination, `.env` remains git-tracked with dev-only values (fragile pattern — flag it); (4) *Verification evidence* — paste `bun run typecheck` and full Playwright suite summary output.
- [ ] **Step 2: CLAUDE.md + package.json + workflow-ex.yml changes.**
- [ ] **Step 3: Final verification**

Run: `bun run typecheck && bunx playwright test`
Expected: typecheck passes; full suite green.

- [ ] **Step 4: Commit**

```bash
git add docs/security-audit-2026-10-18.md CLAUDE.md package.json bun.lock .github/
git commit -m "docs: add security audit summary and correct auth docs"
```
