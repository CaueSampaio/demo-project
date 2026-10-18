# Body-Weight Movements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users flag a movement as "body-weight" at creation; when that movement is selected in the current-workout add-set form, the weight input defaults to the user's most recent recorded body weight (lazily loaded), while staying editable.

**Architecture:** One checkbox on the movements page persists `Movement.isBodyweight` via the existing `createMovementServerFn`. A new `getLatestBodyWeightServerFn` (`findFirst`, `recordedAt desc`) is fetched by the current-workout page through a `useQuery` gated by `enabled: <selected movement is bodyweight>` — the first `enabled`-gated query in the codebase; it must NOT be prefetched in the route loader (that would defeat laziness). When data arrives, a `useEffect` fills the existing `weight` state string, so the add-set guard, button-disable logic, and `addSetServerFn` contract are untouched.

**Tech Stack:** TanStack Start (server fns), TanStack Query v5, Prisma + PostgreSQL, React (uncontrolled-form `useState`, no TanStack Form), Playwright e2e, Bun.

**Spec:** `prompts/body-weight.movements.md`

## Global Constraints

- Package manager/runtime is **Bun**; no new npm dependencies.
- Weights are integer pounds: `Set.weight Int` (zod `min(0)`), `BodyWeightRecord.weightLbs Int` (`min(1).max(1500)`).
- Server fns: zod v4 via `.inputValidator(...)`; user-scoped fns use `.middleware([authMiddleware])`; Prisma access only via `await getServerSidePrismaClient()`.
- Server logic lives in `src/lib/*.server.ts`; query options co-located in route `-queries/` folders; client types inferred from server-fn returns (no shared Movement/Set types).
- Test coverage: **e2e only** (spec explicitly says no other coverage). Playwright targets the dev server at `http://localhost:3000` — Docker dev env (`bun run dev`) must be running; no `webServer` in the config.
- Conventional commits.

## Decisions (locked)

1. **Schema:** The spec's "no database schema updates are needed" is scoped to the set-weight mechanism (weight stays a plain editable `Int` on `Set`; no locking fields). Flagging a movement requires persisting the flag: add `isBodyweight Boolean @default(false)` to `Movement` — one migration.
2. **One checkbox, on the movements page.** The DoD's "when checking the box" means checking the flag at movement creation; the default applies when that movement is selected in the add-set form. No checkbox on the current-workout form.
3. **Lazy loading** = dedicated `getLatestBodyWeightServerFn` fetched only when a body-weight movement is selected (`enabled` gate, no loader prefetch). Picking "last input (time based)" happens in the DB via `orderBy: { recordedAt: "desc" }` + `findFirst` (the `@@index([userId, recordedAt])` exists for this).
4. `staleTime: Infinity` on the latest-weight query: fetched once per session; prevents a window-focus refetch from clobbering a manual weight edit.
5. Auto-fill overwrites the weight field when the fetch arrives (tiny race if the user types within the fetch window — default wins; user can re-edit). Selecting a second body-weight movement does not refetch or re-fill (same cached record).

## Review Focus

1. Body-weight movement selected but user has **no recorded weight** → weight field stays empty, manual entry works, no crash. Pinned: Task 3, test "leaves weight empty...".
2. "Most recent" is by `recordedAt` even if years old → today's record must beat a 400-day-old one, and the newest recorded value is used however old it is. Pinned: Task 3, test "defaults set weight..." (seeds 400 days ago vs today).
3. A **regular** (non-body-weight) movement must never trigger the weight fetch. Pinned: Task 3, test "does not fetch body weight...".
4. Weight input remains **editable after auto-fill** and the edited value (not the default) is persisted. Pinned: Task 3, test "defaults set weight...".
5. Plain creation (checkbox untouched) defaults `isBodyweight` to `false` — zero behavior change for existing movements. Pinned: Task 2, test "flags a movement..." (second half).

## Preconditions (before Task 1)

- Docker dev environment running: `bun run dev` (app on `http://localhost:3000`).
- Sanity check that the e2e harness works in this environment: `bunx playwright test e2e/weight-tracking.spec.ts` — all green (validates DB URL + cookie-secret alignment). If forged cookies fail, align `E2E_COOKIE_SECRET` with the app's `COOKIE_SECRET` before proceeding.

## File Structure

- Modify: `prisma/schema.prisma` — `Movement.isBodyweight`
- Modify: `src/lib/movements.server.ts` — accept + persist the flag
- Modify: `src/routes/__index/_layout.movements/index.tsx` — checkbox in create form
- Modify: `src/lib/weight.server.ts` — new `getLatestBodyWeightServerFn`
- Modify: `src/routes/__index/_layout.current-workout/-queries/current-workout.ts` — new `latestBodyWeightQueryOptions`
- Modify: `src/routes/__index/_layout.current-workout/index.tsx` — enabled-gated query + auto-fill effect + `aria-label="Movement"` on the Select
- Modify: `e2e/helpers/auth.ts` — export the existing module-level Prisma client as `testPrisma`
- Create: `e2e/body-weight-movements.spec.ts` — all 5 e2e tests
- Create (via CLI): `prisma/migrations/<timestamp>_add_movement_is_bodyweight/`

---

### Task 1: `Movement.isBodyweight` — schema + creation API

**Files:**
- Modify: `prisma/schema.prisma` (Movement model)
- Modify: `src/lib/movements.server.ts`
- Create (via CLI): `prisma/migrations/<timestamp>_add_movement_is_bodyweight/`

**Interfaces:**
- Consumes: existing `createMovementServerFn`, `getServerSidePrismaClient`.
- Produces: `createMovementServerFn({ data: { name: string; isBodyweight?: boolean } })` → `{ success: true, movement }` with `movement.isBodyweight: boolean`. `getMovementsServerFn()` rows now include `isBodyweight: boolean` (unmodified `findMany`, no `select`).

- [ ] **Step 1: Add the field to the Movement model in `prisma/schema.prisma`**

```prisma
model Movement {
  id           String  @id @default(uuid())
  name         String
  isBodyweight Boolean @default(false)
  sets         Set[]
}
```

- [ ] **Step 2: Create and apply the migration**

Run: `bun run db:migrate --name add_movement_is_bodyweight`
(fallback if arg forwarding fails: `bunx prisma migrate dev --name add_movement_is_bodyweight`)
Expected: new folder `prisma/migrations/*_add_movement_is_bodyweight/` with `ALTER TABLE "Movement" ADD COLUMN "isBodyweight" BOOLEAN NOT NULL DEFAULT false`; client regenerated (run `bun run generate` if it wasn't).

- [ ] **Step 3: Extend `createMovementServerFn` in `src/lib/movements.server.ts`**

```ts
export const createMovementServerFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ name: z.string().min(1), isBodyweight: z.boolean().default(false) }))
  .handler(async ({ data }: { data: { name: string; isBodyweight: boolean } }) => {
    const prisma = await getServerSidePrismaClient();
    const movement = await prisma.movement.create({
      data: { name: data.name, isBodyweight: data.isBodyweight },
    });
    return { success: true, movement };
  });
```

(`getMovementsServerFn` needs no change — the column flows through `findMany`.)

- [ ] **Step 4: Verify types**

Run: `bun run typecheck`
Expected: PASS (no errors).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/movements.server.ts
git commit -m "feat: add isBodyweight flag to movement model and creation API"
```

---

### Task 2: Body-weight checkbox on the movements page (+ e2e)

**Files:**
- Modify: `e2e/helpers/auth.ts` (export the existing module-level Prisma client as `testPrisma` — add `export`, rename if needed)
- Create: `e2e/body-weight-movements.spec.ts`
- Modify: `src/routes/__index/_layout.movements/index.tsx`

**Interfaces:**
- Consumes: `createMovementServerFn` (Task 1), `createTestUser` / `sessionCookieFor` from `./helpers/auth`.
- Produces: movements list rows carrying `isBodyweight` (consumed by Task 3); `testPrisma` export (consumed by Task 3).

- [ ] **Step 1: Write the failing e2e tests in `e2e/body-weight-movements.spec.ts`**

```ts
import { test, expect } from "@playwright/test";
import { createTestUser, sessionCookieFor, testPrisma } from "./helpers/auth";

/** Movements are global (no userId) — unique names avoid cross-test/run collisions. */
const unique = (base: string) => `${base} ${Date.now()}-${Math.floor(Math.random() * 10_000)}`;

test.describe("body-weight movements", () => {
  let userId: string;

  test.beforeEach(async ({ page }) => {
    const user = await createTestUser();
    userId = user.id;
    await page.context().addCookies(sessionCookieFor(user.id));
  });

  test("flags a movement as body-weight at creation and keeps inputs editable", async ({ page }) => {
    await page.goto("/movements");
    const checkbox = page.getByLabel("Body-weight");
    await checkbox.check();
    await expect(checkbox).toBeChecked();

    const pullUpName = unique("Pull Up");
    const name = page.getByPlaceholder("Movement name");
    await name.fill(pullUpName); // still editable after clicking the checkbox
    await expect(name).toHaveValue(pullUpName);
    await page.getByRole("button", { name: /add/i }).click();
    await expect(name).toHaveValue(""); // form resets; checkbox resets too

    const flagged = await testPrisma.movement.findFirst({ where: { name: pullUpName } });
    expect(flagged?.isBodyweight).toBe(true);

    // plain creation (checkbox auto-reset after onSuccess) keeps the flag false
    const benchName = unique("Bench Press");
    await name.fill(benchName);
    await page.getByRole("button", { name: /add/i }).click();
    const plain = await testPrisma.movement.findFirst({ where: { name: benchName } });
    expect(plain?.isBodyweight).toBe(false);
  });

  test("keeps the name input editable and form submittable after checking the box", async ({ page }) => {
    await page.goto("/movements");
    const checkbox = page.getByLabel("Body-weight");
    const name = page.getByPlaceholder("Movement name");
    await checkbox.check();
    await name.fill("Dip");
    await expect(name).toHaveValue("Dip");
    await expect(checkbox).toBeChecked();
    await expect(page.getByRole("button", { name: /add/i })).toBeEnabled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bunx playwright test e2e/body-weight-movements.spec.ts`
Expected: FAIL — `getByLabel("Body-weight")` finds nothing (no checkbox yet); `testPrisma` not exported.

- [ ] **Step 3: Export `testPrisma` from `e2e/helpers/auth.ts`**

Add `export` to the module-level Prisma client created from `E2E_DATABASE_URL` (lines ~6–9) so tests can assert DB state directly.

- [ ] **Step 4: Implement the checkbox in `MovementsPage` (`src/routes/__index/_layout.movements/index.tsx`)**

- Add state: `const [isBodyweight, setIsBodyweight] = useState(false);`
- Change the mutation to `mutationFn: (data: { name: string; isBodyweight: boolean }) => createMovementServerFn({ data })`; in `onSuccess` reset both: `setName(""); setIsBodyweight(false);`
- `handleSubmit` passes `{ name: name.trim(), isBodyweight }`.
- JSX — insert between the name `Input` and the submit `Button` inside the `<form>` (native checkbox, precedent from `workout-history`):

```tsx
<label className="flex items-center gap-2 text-sm">
  <input
    type="checkbox"
    checked={isBodyweight}
    onChange={(e) => setIsBodyweight(e.target.checked)}
    className="rounded border-gray-300"
  />
  Body-weight
</label>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bunx playwright test e2e/body-weight-movements.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/routes/__index/_layout.movements/index.tsx e2e/helpers/auth.ts e2e/body-weight-movements.spec.ts
git commit -m "feat: allow flagging movements as body-weight on creation"
```

---

### Task 3: Lazy latest-weight default in the current workout (+ e2e)

**Files:**
- Modify: `src/lib/weight.server.ts`
- Modify: `src/routes/__index/_layout.current-workout/-queries/current-workout.ts`
- Modify: `src/routes/__index/_layout.current-workout/index.tsx`
- Modify: `e2e/body-weight-movements.spec.ts`

**Interfaces:**
- Consumes: `isBodyweight` on movement rows (Task 1), `testPrisma`, `seedWeights` from `./helpers/auth`.
- Produces: `getLatestBodyWeightServerFn(): Promise<BodyWeightRecord | null>` (record with `{ weightLbs: number, recordedAt, ... }` or `null`); `latestBodyWeightQueryOptions()` with `queryKey: ["latest-body-weight"]`.

- [ ] **Step 1: Write the failing e2e tests (append to `e2e/body-weight-movements.spec.ts`)**

Add the import of `type Page` from `@playwright/test`, `seedWeights` to the existing helpers import, and this helper at module level (below `unique`):

```ts
/**
 * Dev-mode server-fn request URL: /_serverFn/<functionId> where functionId is
 * base64url(JSON.stringify({ file: "/@id/<relpath>", export: "<fnName>" })).
 * Decoding the id pins the matcher to the export name (immune to path changes).
 */
function trackLatestWeightRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (req) => {
    const url = req.url();
    const marker = "/_serverFn/";
    const idx = url.indexOf(marker);
    if (idx === -1) return;
    const id = url.slice(idx + marker.length).split(/[?/]/)[0]!;
    try {
      const parsed = JSON.parse(Buffer.from(id, "base64url").toString("utf8")) as { export?: string };
      if (parsed?.export === "getLatestBodyWeightServerFn") urls.push(url);
    } catch {
      // not a dev-mode server-fn id — ignore
    }
  });
  return urls;
}
```

Add these tests inside the existing `test.describe` (userId in scope):

```ts
  test("defaults set weight to the latest recorded body weight and keeps it editable", async ({ page }) => {
    await seedWeights(userId, [{ daysAgo: 400, weightLbs: 180 }, { daysAgo: 0, weightLbs: 184 }]);
    await testPrisma.workout.create({ data: { userId } });

    // create the body-weight movement through the UI (exercises the Task 2 flag)
    const pullUpName = unique("Pull Up");
    await page.goto("/movements");
    await page.getByLabel("Body-weight").check();
    await page.getByPlaceholder("Movement name").fill(pullUpName);
    await page.getByRole("button", { name: /add/i }).click();

    const weightRequests = trackLatestWeightRequests(page);
    await page.goto("/current-workout");
    await page.getByLabel("Movement").selectOption({ label: pullUpName });
    await page.getByPlaceholder("Reps").fill("10");

    const weight = page.getByLabel("Weight");
    await expect(weight).toHaveValue("184"); // latest by recordedAt beats the 400-day-old 180
    expect(weightRequests.length).toBeGreaterThanOrEqual(1); // lazy fetch fired on selection

    await weight.fill("200"); // input stays editable after auto-fill
    await page.getByRole("button", { name: /add/i }).click();
    await expect(async () => {
      const set = await testPrisma.set.findFirst({
        where: { movement: { name: pullUpName }, workout: { userId } },
      });
      expect(set?.weight).toBe(200); // edited value persisted, not the default
    }).toPass({ timeout: 5_000 });
  });

  test("does not fetch body weight for a regular movement", async ({ page }) => {
    await seedWeights(userId, [{ daysAgo: 0, weightLbs: 184 }]);
    await testPrisma.workout.create({ data: { userId } });
    const benchName = unique("Bench Press");
    await testPrisma.movement.create({ data: { name: benchName, isBodyweight: false } });
    const bench = await testPrisma.movement.findFirstOrThrow({ where: { name: benchName } });

    const weightRequests = trackLatestWeightRequests(page);
    await page.goto("/current-workout");
    await page.getByLabel("Movement").selectOption({ label: benchName });
    await page.getByPlaceholder("Reps").fill("5");
    await page.getByLabel("Weight").fill("135");
    await page.getByRole("button", { name: /add/i }).click();
    await expect(async () => {
      const set = await testPrisma.set.findFirst({
        where: { movement: { id: bench.id }, workout: { userId } },
      });
      expect(set?.weight).toBe(135); // completing a real round-trip proves the page settled
    }).toPass({ timeout: 5_000 });

    expect(weightRequests).toHaveLength(0); // lazy: never fetched for a regular movement
  });

  test("leaves weight empty for a body-weight movement when no weight was ever recorded", async ({ page }) => {
    await testPrisma.workout.create({ data: { userId } });
    const dipName = unique("Dip");
    await testPrisma.movement.create({ data: { name: dipName, isBodyweight: true } });

    await page.goto("/current-workout");
    await page.getByLabel("Movement").selectOption({ label: dipName });
    await expect(page.getByLabel("Weight")).toHaveValue(""); // no records -> no default, no crash
    await page.getByPlaceholder("Reps").fill("8");
    await page.getByLabel("Weight").fill("95"); // manual entry still possible
    await page.getByRole("button", { name: /add/i }).click();
    await expect(async () => {
      const set = await testPrisma.set.findFirst({
        where: { movement: { name: dipName }, workout: { userId } },
      });
      expect(set?.weight).toBe(95);
    }).toPass({ timeout: 5_000 });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bunx playwright test e2e/body-weight-movements.spec.ts`
Expected: the 3 new tests FAIL — `getByLabel("Movement")` finds nothing (no aria-label yet), weight never auto-fills to "184"; the request tracker never matches.

- [ ] **Step 3: Implement `getLatestBodyWeightServerFn` in `src/lib/weight.server.ts`**

Mirror `getWeightsServerFn`'s typing style in the same file:

```ts
export const getLatestBodyWeightServerFn = createServerFn()
  .middleware([authMiddleware])
  .handler(async ({ context }: { context: { user: { id: string } } }) => {
    const prisma = await getServerSidePrismaClient();
    return prisma.bodyWeightRecord.findFirst({
      where: { userId: context.user.id },
      orderBy: { recordedAt: "desc" },
    });
  });
```

- [ ] **Step 4: Add `latestBodyWeightQueryOptions` in `src/routes/__index/_layout.current-workout/-queries/current-workout.ts`**

```ts
export const latestBodyWeightQueryOptions = () =>
  queryOptions({
    queryKey: ["latest-body-weight"],
    queryFn: () => getLatestBodyWeightServerFn(),
  });
```

Do NOT add it to the route loader — laziness depends on it being fetched on demand only.

- [ ] **Step 5: Wire the default into the current-workout page**

In `src/routes/__index/_layout.current-workout/index.tsx`:

- Add `aria-label="Movement"` to the movement `<Select>` (e2e uses `getByLabel("Movement")`; mirrors `WeightInput`'s `aria-label="Weight"`).
- Derive the flag and run the gated query + fill effect (new imports: `useEffect` from react, `useQuery` from `@tanstack/react-query`, `latestBodyWeightQueryOptions` from `./-queries/current-workout`):

```tsx
const isBodyweightSelected =
  movements.find((m) => m.id === selectedMovement)?.isBodyweight ?? false;

const { data: latestWeight } = useQuery({
  ...latestBodyWeightQueryOptions(),
  enabled: isBodyweightSelected,
  staleTime: Infinity,
});

useEffect(() => {
  if (isBodyweightSelected && latestWeight?.weightLbs != null) {
    setWeight(String(latestWeight.weightLbs));
  }
}, [isBodyweightSelected, latestWeight]);
```

Do not add `disabled` to the weight input, do not change `handleAddSet`, the Add button's `disabled` logic, or `addSetServerFn` — the existing `!weight` guard already handles the async fill.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bunx playwright test e2e/body-weight-movements.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 7: Full suite + types**

Run: `bun run typecheck && bunx playwright test`
Expected: typecheck PASS; all specs PASS (movements/sets/workouts specs are `test.skip` skeletons; weight-tracking must stay green).

- [ ] **Step 8: Commit**

```bash
git add src/lib/weight.server.ts src/routes/__index/_layout.current-workout e2e/body-weight-movements.spec.ts
git commit -m "feat: default set weight to latest body weight for body-weight movements"
```

---

## Spec coverage check

| Spec requirement | Task |
|---|---|
| Flag movement as body-weight at creation (movements page) | Task 1 + Task 2 |
| Default weight = most recent user-inputted weight when added to current workout | Task 3 |
| No locking of weight; input stays editable after checkbox / auto-fill | Task 2 test 2 + Task 3 tests |
| Lazy loading of user weight (no unnecessary data stream) | Task 3 (`enabled` gate + no loader prefetch + "does not fetch" test) |
| e2e coverage only | Tasks 2–3 (no unit tests added) |
| Follow CLAUDE.md structure | Global Constraints |
