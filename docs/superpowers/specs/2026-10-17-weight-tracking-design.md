# Weight Tracking — Design Document

Date: 2026-10-17
Status: Approved scope; built from conversation + `prompts/weight-tracking.md`

## Intent and Why

The app currently tracks training (workouts, movements, sets). This adds the
first piece of *personal data*: body weight. A user logs their weight from time
to time and sees a chart of how it evolved over any timespan, from days to
years. This is a lifetime-scale log, not a per-session metric — consistency and
readability as the timespan grows are the main visualization concern.

## Goals

- A logged-in user can record their body weight (in lbs, integers) any number
  of times, timestamped automatically.
- The user sees a line chart of weight over time that auto-fits the data:
  the x-axis spans exactly the recorded points and spreads naturally as
  intervals between logs grow (2 days → a week → a month → years).
- A chronological entry list lets the user delete a bad entry.
- e2e tests cover the new page and weight tracking.

## Non-Goals / Anti-Goals

- No editing of recorded weights (delete only, for now).
- No user-set time interval/range picker on the chart — the scale is derived
  from the data itself.
- No decimals in weight input or display; no unit switching (lbs is the system
  unit everywhere, same as the existing `Set.weight`).
- No goal lines, projections, or stats cards beyond the chart and the list.
- No padding of the x-axis to "today" — chart shows tracked data only.

## Constraints

- Follow the repo conventions in `CLAUDE.md`: Bun, TanStack Start/Router/
  Query/Form, Prisma + PostgreSQL via `db.server.ts`, Tailwind v4 +
  Better Bookkeeping UI (shadcn wrapper), Playwright e2e in `e2e/`,
  server logic in `src/lib/*.server.ts` with `createServerFn` and
  `authMiddleware`, ast-grep for structural code search.
- Chart library: `@tanstack/charts` (published, v1.1.0) — decided, fixed, no fallback to another library. If the adaptive time axis comes out at lower fidelity inside this library, ship it as-is (reduced fidelity accepted) rather than switching.

## Decided During Design

### Data model

- New Prisma model `BodyWeightRecord`:
  - `id String @id @default(uuid())`
  - `userId String` + `user User @relation(fields: [userId], references: [id])`
  - `weightLbs Int` — stored in lbs as integer, no conversion layer.
  - `recordedAt DateTime @default(now())`
- `User` gains `bodyWeights BodyWeightRecord[]` (same pattern as `workouts`).
- Prisma migration via `bun run db:migrate`.

### Validation

- Server: zod — `weightLbs: z.number().int().min(1).max(1500)`
  (range ~1–1500 lbs is my call; revisit if it ever bites).
- Client: a shared `WeightInput` component (Input + "lbs" suffix + integer validation, bounds via `min`/`max` props) extracted and reused by both the new weight-tracking form (`min=1`, `max=1500`) and the existing current-workout weight field (`min=0` so bodyweight sets still work). The workout field currently uses a bare `<Input type="number" min={0}>` with `parseInt`; the server-side zod for set weights is NOT changed in this feature.

### Server functions (`src/lib/weight.server.ts`)

- `addBodyWeightServerFn` — zod-validated, protected by `authMiddleware`,
  sets `recordedAt` server-side (`@default(now())`), returns the record.
- `getWeightsServerFn` — returns the current user's records ordered by
  `recordedAt` ascending (chart needs chronology).
- `deleteWeightServerFn` — takes record id; scoping to the current user is
  required (a user must never delete another user's record).
- Access DB through `getServerSidePrismaClient()` from `src/lib/db.server.ts`.

### Page (`/profile`)

- New file route in `src/routes/` following the existing `__index/_layout`
  pattern (auth-protected via `beforeLoad`, same as other pages).
- Added to the `navItems` array in `__index/_layout.tsx` with a lucide icon
  (icon choice and item label "Profile" are minor builder calls).
- Content, top to bottom:
  1. Section titled "Weight Tracking".
  2. Form wrapping the shared `WeightInput` and a submit button
     (empty/invalid input disables or blocks submit).
  3. Line chart of all records: x = time (first → last record), y = lbs.
     - Auto-fitting time axis (no fixed range, no padding to today).
     - Tick density adapts to the span: days → weeks → months → years;
       constant effort to remain readable at any span is the "visual
       consistency" requirement.
     - Tooltip/date formatting follows the scale of the span.
     - Empty state (no records yet) must look intentional.
     - With exactly one record: render the single data point (no artificial line/domain padding).
  4. Chronological entry list ("184 lbs — Oct 17, 2026" + delete button).
- TanStack Query mutations invalidate the chart/query data on add/delete,
  consistent with how the workout pages work today.
- Styling with Better Bookkeeping UI components (Card etc.) + Tailwind,
  matching the existing pages.

### e2e tests (`e2e/`)

- Playwright, following the existing test patterns in `e2e/` (note: all current spec files are skipped stubs; there is no existing auth infrastructure).
- Auth is out of scope: mock or bypass whatever auth-related pieces are needed (session cookie / intercepted auth), and do not build new auth tests. Only the weight-tracking feature itself is tested.
- Cover: navigating to `/profile`, adding a weight, seeing it in chart data and the list, and deleting an entry.

### Builder-check answers

- e2e auth: mocked/bypassed, no new auth tests built (decision: user).
- Chart fallback: none allowed; `@tanstack/charts` stays even at reduced fidelity (decision: user).
- `WeightInput` bounds via props; workout keeps `min 0`, tracker uses `1–1500` (my call).
- Single-record chart renders one point (my call).

## Left to the Builder

- Exact chart composition/typesetting details with `@tanstack/charts` v1.1.0
  (how tick adaptation is configured for a time axis).
- Empty-state copy and minor styling details.
- Test-level structure and fixtures beyond what existing `e2e/` patterns
  already establish.
- Ordering of technical steps and whether the shared `WeightInput` refactor
  of the workout field happens alongside or after the new page (both are in
  scope).
