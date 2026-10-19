# UI/UX Refactor — Design

**Date:** 2026-10-19
**Status:** Draft for approval
**Source prompt:** `prompts/ui-improvements.md`

## 1. Intent

The app works, but it does not feel like a finished product. The current UI has no design
system, mixed color and spacing decisions, a desktop-only shell, and a Workout History page
that reads as one long document. The target reaction, in the user's words, is:

> "It's beautiful and so easy to use, feels amazing."

This refactor establishes a small, consistent design system, rebuilds the app shell so it
works on phones, applies that system to every page and shared component, and reworks Workout
History around scannable cards plus a focused detail modal.

## 2. Goals

- Make the app feel polished, calm, and intentional at first glance.
- Make every page usable and comfortable at 390px wide without horizontal scrolling.
- Fix the broken content scroll while keeping the side navigation fixed on desktop.
- Create shared tokens and shared components so pages stop inventing their own styling.
- Make Workout History scannable: cards with date, time, movement summary, and explicit actions.
- Move workout detail into a modal with an Overview tab and one tab per movement.
- Show volume trends over time and the weight × reps relationship per movement.
- Preserve all existing behavior; this is a UI/UX refactor, not a feature rewrite.

## 3. Non-goals

- No changes to server functions, API contracts, auth behavior, rate limiting, or CSRF.
- No database schema changes or migrations. `Workout.completedAt` already carries the time,
  and `Set.createdAt` already exists.
- No workout duration. We do not store a start time, so we will not invent one.
- No new workout semantics: no rest timers, supersets, RPE, notes, or editing completed sets.
- No pagination or infinite scrolling for history.
- No change to destructive behavior: deleting a workout or weight entry stays immediate.
- No redesign of the TanStack/React Query devtools beyond moving them out of the way.

## 4. Anti-goals

- A dark shell. The chosen direction is light so the original wordmark keeps its black + blue
  lockup and stays legible without inversion.
- Decorative gradients, glassmorphism, neon glows, or large drop shadows.
- A wall of equally weighted cards and buttons.
- Hiding required information behind hover-only tooltips, especially on touch.
- Using yellow as a primary button color. Yellow is a highlighter/accent, not the main CTA.
- Copying the existing page markup and only recoloring it. The shell and Workout History
  structure change.

## 5. Decisions

| Decision | Choice |
| --- | --- |
| Visual direction | **B — Paper & Ink** |
| Mobile navigation | **A — bottom tab bar** |
| Workout detail charts | **B — hybrid: Overview volume trend + per-movement weight × reps** |
| Primary color | Wordmark blue `#224F6A` |
| Accent | Highlighter yellow `#F5C518` |
| Surface | Warm paper `#FAF7F0`, cards `#FFFDF7` |
| Typeface | Manrope (400–800), tabular numerals for metrics |
| Desktop menu | Light warm sidebar, original wordmark, brand-blue active state |
| Mobile menu | Compact top bar + four-item bottom tab bar |
| Component strategy | Keep local components; add Radix primitives for Dialog, Tabs, Tooltip, Popover |
| Dialog state | `?workout=<id>` search param; Back closes the dialog, direct links open it |
| Delete behavior | Immediate, unchanged; no confirmation dialog |
| Signed-in indicator | Keep the “Logged in as” account footer on the desktop sidebar |

### Why Radix

The modal, tabs, and movement disclosure need real focus management, keyboard support, and
ARIA relationships. Writing those from scratch is more risk than value. The components remain
local wrappers in `src/components/ui/`; no external design system is introduced. New runtime
dependencies: `@radix-ui/react-dialog`, `@radix-ui/react-tabs`, `@radix-ui/react-tooltip`,
and `@radix-ui/react-popover`.

## 6. Design tokens

Tokens live in `src/styles.css` under Tailwind v4 `@theme` and `@layer base`.

### Color

| Token | Value | Usage |
| --- | --- | --- |
| `--color-background` | `#FAF7F0` | App canvas |
| `--color-foreground` | `#171614` | Primary text |
| `--color-card` | `#FFFDF7` | Cards, inputs, dialog |
| `--color-card-foreground` | `#171614` | Card text |
| `--color-muted` | `#F1ECE1` | Sidebar, secondary surfaces, chips |
| `--color-muted-foreground` | `#5F5A50` | Secondary text (5.9:1 on muted) |
| `--color-border` | `#E1D8C8` | Default border |
| `--color-input` | `#D8CEBD` | Input/select border |
| `--color-primary` | `#224F6A` | Primary actions, active nav, charts |
| `--color-primary-foreground` | `#FFFFFF` | Text on primary (8.8:1) |
| `--color-secondary` | `#F1ECE1` | Secondary buttons |
| `--color-secondary-foreground` | `#171614` | Text on secondary |
| `--color-accent` | `#F5C518` | Highlighter, active marker, PR badge |
| `--color-accent-foreground` | `#171614` | Text on accent (11.8:1) |
| `--color-destructive` | `#B42318` | Destructive actions |
| `--color-destructive-foreground` | `#FFFFFF` | Text on destructive |
| `--color-success` | `#067647` | Success text/icons |
| `--color-warning` | `#B54708` | Warning text/icons |
| `--color-ring` | `#224F6A` | Focus ring |
| `--color-chart-1` | `#224F6A` | Chart series 1 |
| `--color-chart-2` | `#5B87A3` | Chart series 2 |
| `--color-chart-3` | `#F5C518` | Chart series 3 |
| `--color-chart-4` | `#8C6D00` | Chart series 4 |
| `--color-chart-5` | `#A99F8D` | Chart series 5 / “Other” |

Soft status surfaces:

- destructive: background `#FEF3F2`, border `#FECDCA`, text `#B42318`
- success: background `#ECFDF3`, border `#ABEFC6`, text `#067647`
- warning: background `#FFFAEB`, border `#FEDF89`, text `#B54708`

The base layer must set `border-color: var(--color-border)` on `*`, `::before`, and `::after`.
Tailwind v4 otherwise falls back to `currentColor`, which is the root cause of the current
black card borders.

### Typography

- `--font-sans: "Manrope", ui-sans-serif, system-ui, sans-serif;`
- Load Manrope 400, 500, 600, 700, 800 from Google Fonts in `__root.tsx`; remove Raleway/Roboto.
- Page title: `text-2xl md:text-3xl font-extrabold tracking-tight`.
- Section title: `text-lg font-bold tracking-tight`.
- Body: `text-sm md:text-base leading-6`.
- Secondary text: `text-sm text-muted-foreground`.
- Eyebrow/label: `text-xs font-semibold uppercase tracking-wider`.
- Metrics: `tabular-nums`.
- Do not use more than four sizes on one screen.

### Spacing, radius, shadow, motion

- Page padding: `px-4 py-6` mobile, `md:px-6 md:py-8`, `lg:px-8`.
- Content max width: `max-w-6xl mx-auto`.
- Stack gap: `space-y-6`; card internals: `p-4 md:p-6`; form gap: `gap-4`.
- Radii: buttons/inputs `0.625rem`, cards `1rem`, dialogs `1.25rem`.
- Shadows: warm and barely visible.
  - `--shadow-xs: 0 1px 2px rgb(23 22 20 / 0.04)`
  - `--shadow-sm: 0 2px 8px rgb(23 22 20 / 0.06)`
  - `--shadow-md: 0 12px 32px rgb(23 22 20 / 0.10)`
- Motion: 150–200ms ease-out; no animation when `prefers-reduced-motion: reduce`.

## 7. App shell and scrolling

`src/routes/__index/_layout.tsx` is rebuilt around a viewport-height shell:

- Outer: `flex h-dvh overflow-hidden bg-background`.
- Desktop sidebar: `hidden lg:flex lg:w-64 xl:w-72`, `bg-muted`, right border, full height,
  own column. Contains wordmark, nav, and account footer.
- Main column: `flex min-w-0 flex-1 flex-col`.
- Mobile top bar: `lg:hidden`, sticky, warm paper, wordmark, profile avatar link.
- Scroll container: `flex-1 overflow-y-auto` with `min-h-0` on flex children. All page content
  lives inside it. This is the scroll fix.
- Mobile bottom nav: `lg:hidden fixed inset-x-0 bottom-0`, four equal tabs, safe-area padding.
  Content wrapper adds bottom padding so the last card clears the bar.
- Desktop content wrapper: `mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8 lg:px-8`.
- Skip link as the first focusable element: “Skip to main content” → `#main-content`.
- `<nav aria-label="Main">`, `<main id="main-content">`.
- Active links use `aria-current="page"` (TanStack Router active props) and brand-blue fill.
- Move TanStack devtools to bottom-right so they do not cover the account footer.

### Desktop sidebar

- Logo at the top with original wordmark, `alt="Better Bookkeeping"`.
- Nav rows: icon + label, 44px high, rounded 10px.
- Inactive: muted foreground. Hover: brand-50 tint. Active: brand blue background, white text.
- Account footer: “Logged in as” + name/email + Log out. Preserve the exact “Logged in as”
  string for existing auth tests.

### Mobile shell

- Top bar: original wordmark left, circular avatar/initials link to `/profile` right.
- Bottom tabs: Current Workout, Workout History, Movements, Profile.
- Active tab: brand-blue icon/label plus a small yellow marker above or beside the icon.
- Each tab is at least 44px tall, includes a visible label, and uses `aria-current="page"`.
- The tab bar has a top border and `padding-bottom: env(safe-area-inset-bottom)`.
- Logout is reachable from Profile; the desktop footer remains as a shortcut.

## 8. Component inventory

All components are local under `src/components/ui/`. Existing APIs stay compatible where
possible; page code is updated to use the new variants.

### Updated

- **Button**: variants `default` (brand blue), `secondary` (warm neutral), `outline`,
  `ghost`, `destructive`, `link`, `accent` (yellow; reserved for high-emphasis highlights).
  Sizes `sm`, `default`, `lg`, `icon`. Focus ring, disabled, `aria-busy` when loading.
- **Card**: warm surface, warm border, radius 16, shadow-xs. Add `CardDescription`,
  `CardFooter`.
- **Input / Select**: warm card background, `--color-input` border, 40px height, radius 10,
  visible label support, focus ring, disabled state. Style native select with a chevron.
- **Alert**: default, destructive, warning, success using the soft status surfaces.
- **Dropdown menu**: align to new tokens.

### New

- **PageHeader**: `h1`, optional description, optional actions. Consistent across pages.
- **Field**: label + control + hint/error, with generated `id`/`aria-describedby`.
- **Badge**: neutral, brand, accent, success, destructive.
- **Checkbox**: native checkbox, styled, with label.
- **Dialog**: Radix wrapper with portal, overlay, title, description, close button.
  Responsive: centered `max-w-3xl` on desktop, full-screen sheet on mobile with internal scroll.
- **Tabs**: Radix wrapper with underline active state, horizontal overflow on mobile, keyboard
  arrow navigation.
- **Tooltip**: Radix wrapper for desktop hints. Not the only way to access any information.
- **Popover**: Radix wrapper for touch-friendly movement disclosure.
- **Separator**, **Skeleton**, **EmptyState**.
- **StatCard**: label, value, optional unit/trend; used for workout and weight summaries.
- **MovementChips**: movement summary chips + “+N more” popover with full list, set count, and
  volume.
- **Confirm?** No. Destructive actions remain immediate.

## 9. Page specifications

### 9.1 Auth pages (`sign-in.tsx`, `create-account.tsx`)

- Desktop: two-column layout. Left brand panel in `bg-primary` with white wordmark and a short
  value statement; right form card on paper. Mobile: single centered card with wordmark.
- Use `Field`, `Input`, `Button`, and `Alert` for errors.
- Keep labels, placeholders, button names, autocomplete attributes, and error copy exactly:
  “Name”, “Email”, “Password”, “Create account”, “Sign in”, “Invalid email or password”.
- Remove the stray `console.log("Result", result)`.
- No behavior changes.

### 9.2 Current Workout (`_layout.current-workout/index.tsx`)

- `PageHeader` title “Current Workout”; actions contain the complete-workout button when a
  workout is active.
- Empty state: “No active workout. Ready to start?” plus “Start Workout” primary button.
- Active session card:
  - Long date heading (`h2`) in the existing `todayLong()` format, so the current test still
    finds it.
  - Summary strip: Sets, Movements, Total Volume.
  - Add-set form: movement select, weight, reps, Add button. One column on mobile, a responsive
    grid on desktop. Visible labels; placeholders retained for tests (“Reps”).
  - Bodyweight helper: when the selected movement is bodyweight, show a note that weight is
    prefilled from the latest body weight. Keep the existing prefill behavior.
  - Sets grouped by movement. Each group shows movement name, bodyweight badge, set count, and
    volume. Each set row shows “{reps} reps × {weight} lbs” and a delete icon button with an
    accessible label. The existing text pattern stays intact.
  - Empty sets state: “No sets yet. Add exercises to your workout!” (keep text).
- Toasts: success on start, add, delete set, complete; error toast on failure.
- Complete Workout stays a primary action but is visually distinct from Add. No confirmation.

### 9.3 Movements (`_layout.movements/index.tsx`)

- `PageHeader` title “Movements”.
- Add-movement card: name input, “Body-weight” checkbox with a real label, Add button.
  Keep the placeholder “Movement name (e.g. Bench Press)” and the “Add” button name.
- Search field: label “Search movements”, placeholder “Search by name…”. Filters client-side,
  case-insensitive. Show result count. No server change.
- List: rows in a `<ul>`. Each `<li>` contains a link whose accessible name is exactly the
  movement name, a bodyweight badge when applicable, and a trailing chevron marked
  `aria-hidden`. Do not add “View progress” to the link's accessible name.
- Empty state when there are no movements. Separate “No movements match” state when search
  returns nothing.
- Keep alphabetical order from the server.

### 9.4 Movement detail (`_layout.movements/$movementId.tsx`)

- Back link “All movements”; `PageHeader` with movement name and “All-time progress”.
- Summary stat cards: Max Weight, Total Reps, Total Volume, Sessions. Derived from the existing
  query data.
- Chart card: title “Progress”, native metric select with label “Metric” (keep for tests),
  chart. Chart aria label keeps the pattern `{movement} — {metric} over time`.
- Empty state keeps “No completed workouts yet.”
- Apply the new chart theme (paper grid, brand-blue series, warm tooltip), but do not change
  the metric semantics or the server data.

### 9.5 Profile (`_layout.profile/index.tsx`)

- `PageHeader` title “Profile”.
- Account card: name, email, and a Log out action linking to `/logout`. The desktop sidebar
  still shows the “Logged in as” footer.
- Weight summary: latest weight, change since the first entry, number of entries.
- Weight form: label “Weight”, Add button; keep the existing validation behavior.
- Weight trend card: title “Weight Tracking” (keep for tests), chart aria label
  `Weight over time`.
- Weight history card: list rows keep `data-testid="weight-entry"` and
  `data-recorded-at`. Row text keeps the “{lbs} lbs — {date}” pattern. Delete control is an
  icon/text button whose accessible name contains “Delete”.
- Empty state keeps “No weight entries yet. Add one above!”.
- Toasts on add/delete success and failure.

### 9.6 Workout History (`_layout.workout-history/index.tsx`)

#### Page header

- `PageHeader` title “Workout History”.
- Optional summary strip: completed workouts, total volume, movements trained. All derived
  client-side.
- Empty state keeps “No completed workouts yet.”.

#### Workout cards

Responsive grid: 1 column mobile, 2 columns `md`, 3 columns `xl`. Each card contains:

- Date: weekday, month, day, year.
- Time: `h:mm a` from `completedAt`. This is the “time we don’t have now”.
- Small metadata row: movements count, sets count, total volume.
- Movement summary: up to 3 visible chips (movement names), then a `+N more` button.
  - The button opens a Popover listing every movement with its set count and volume.
  - If there are 3 or fewer movements, show all chips and no button.
  - Chips are not links; they are summaries.
- Actions in one row:
  - `Check Details` — primary, `size="sm"`, opens the dialog.
  - `Delete` — `variant="outline"`, `size="sm"`, with trash icon. Same row, smaller visual
    weight.
- Accessible names:
  - `Check details for workout {date} at {time}`
  - `Delete workout {date} at {time}`
- No nested interactive card. Only the buttons are interactive.
- Deleting updates the query and removes the card. No confirmation.

#### Workout detail dialog

- Opened by `Check Details` for a specific workout. The open workout is stored in the
  `?workout=<id>` search param, not in transient component state.
  - Clicking `Check Details` navigates to the same page with the param set.
  - Closing the dialog removes the param and pushes/replaces history so the mobile Back
    gesture closes the dialog instead of leaving the page.
  - A direct link with a valid `?workout=<id>` opens that workout. An invalid or deleted id
    closes the dialog. There is no default open state without a param.
- Header: full date and time, close button, and a description with movement/set/volume counts.
- Tabs:
  - **Overview** (default)
  - One tab per movement, sorted alphabetically. Horizontal scroll on mobile.
- Overview tab:
  - Summary stat cards for the selected workout.
  - “Volume by movement” stacked area chart for the six-workout window **ending at the
    selected workout**. The selected workout is the newest point in the window; if it is the
    most recent workout overall, the window is simply the last six. The selected date gets a
    small marker and a “Selected workout” caption.
  - Series: only movements performed in the selected workout. Rank those by total volume
    across the window, keep the top 5, and aggregate any remainder as “Other”. This keeps the
    legend aligned with the movement tabs and avoids a ten-color palette.
  - x = workout date, y = volume, stacked. Use the visual language of the TanStack
    `140-shadcn-area-stacked-expand` example: soft area fills, thin strokes, muted grid,
    grouped tooltip.
  - Legend maps movement names to chart colors.
- Movement tab:
  - Header: movement name + bodyweight badge when applicable.
  - Stat cards: Max Weight, Total Reps, Total Volume, Sets.
  - Chart: **weight on x, reps on y**, one bubble per set, bubble area proportional to
    volume (weight × reps), dots connected in performed order. This is the axes swap and keeps
    volume encoding exact.
  - Tooltip: set ordinal, weight, reps, volume.
  - Axis labels: “Weight (lbs)” and “Reps”.
  - aria label: `{movement} — weight vs reps (area = volume) on {date}`.
  - Set list: performed order, `1st: {weight} lbs × {reps}`, volume, and time from
    `set.createdAt` when available.
- Dialog a11y: `aria-modal`, labelled title, focus trap, Escape closes, overlay click closes,
  focus returns to the trigger. Body scroll locked while open.
- Mobile: full-screen dialog; sticky header; tabs scroll horizontally; chart height ~220px.

### 9.7 Logout (`logout.tsx`)

- Style as a centered card on paper: “Sign out of Better Bookkeeping?” and a primary
  “Log out” button plus a Cancel link back to `/current-workout`.
- Keep the form POST and the `router.navigate({ to: "/sign-in" })` behavior. Keep the button
  accessible name “Log out”.

### 9.8 Root error (`__root.tsx`)

- Apply tokens and shared Card/Alert/Button.
- Keep the existing copy and actions (“Try again”, “Go to home”).
- Move devtools to bottom-right.

## 10. Chart specifications

All charts use `@tanstack/charts` with the installed version. No new chart library.

### Overview volume chart

- Data: the six-workout window ending at the selected workout, in ascending date order.
  If fewer than six earlier workouts exist, use everything available up to the selected one.
- Only movements performed in the selected workout are candidates. For each candidate
  movement, compute its volume in each workout of the window (0 if it was not performed).
- Rank the candidates by total volume across the window; keep the top 5, aggregate the rest as
  “Other”.
- Rows: `{ date, movementName, volume }`. The selected date is marked on the chart.
- Marks: `areaY` with `x: "date"`, `y: "volume"`, `z: "movementName"`, `color: "movementName"`,
  `layout: stack({ order: [...] })`.
- x scale: `scaleUtc`, nice, 4–6 ticks. y scale: `scaleLinear`, nice, grid.
- Absolute stacked values (not normalized) so the y axis reads as real volume.
- Tooltip: date title, rows per movement with formatted volume.
- Colors: `chart-1`…`chart-5`, “Other” in `chart-5`/neutral.

### Movement weight × reps chart

- Rows: one per set of the selected movement in the selected workout, in performed order.
- x = weight, y = reps, bubble area = volume.
- `lineY` through performed order + `dot` with `r` mapped from volume via `scaleSqrt`.
- Tooltip: set ordinal, weight, reps, volume.
- Colors: brand blue; light fill with a stronger stroke for accessibility.
- Empty movement (should not happen because tabs only exist for movements in the workout):
  render an inline empty message.

## 11. Accessibility requirements

- Every page has exactly one `h1`; section headings use `h2`/`h3` in order.
- All form controls have programmatic labels; placeholders are not labels.
- All icon-only buttons have accessible names.
- Focus-visible ring is always visible on keyboard focus, with sufficient offset.
- Color is never the only signal: active nav also uses fill/shape; bodyweight uses a text
  badge; chart series use a legend and tooltip labels.
- Contrast targets: body text ≥ 4.5:1; large text ≥ 3:1; primary white-on-blue 8.8:1; active
  yellow-on-ink 11.8:1.
- Dialog: focus trap, labelled title, Escape, overlay click, focus restore.
- Tabs: `role="tablist"`, `role="tab"`, `aria-selected`, arrow-key navigation, associated
  `tabpanel`.
- Popover: opens on click/Enter/Space, closes on Escape and outside click; information is
  also available without hover.
- Mobile nav items have visible labels, at least 44px targets, and `aria-current`.
- Skip link; `<main id="main-content">`; nav landmarks labelled.
- Respect `prefers-reduced-motion`.
- Toast messages must not be the only place where an error is conveyed in a form; inline
  errors stay.

## 12. Responsive behavior

- Breakpoints: mobile `< 768px`, tablet `768–1023px`, desktop `≥ 1024px`.
- Sidebar appears at `lg`; below that, bottom tabs.
- Page grids: 1 column mobile, 2 columns `md`, 3 columns `xl` for workout cards.
- Forms: stack on mobile; two columns for compact numeric fields on `sm`+, full row on `lg`.
- Charts: 220px tall mobile, 280–320px desktop. Always readable without horizontal scrolling.
- Dialog: full-screen below `md`; centered max-width above.
- Tables (none currently) would become stacked cards below `md`.

## 13. E2E test impact

No behavioral tests change. UI selectors and flows are updated to match the new structure.

- `e2e/workouts.spec.ts`
  - History: open a workout card via `Check details` and assert inside the dialog.
  - Delete by the new `Delete workout {date} at {time}` name; assert card removal.
  - Current workout: set assertions scope to the set row/group to remain unambiguous.
- `e2e/workout-progress.spec.ts`
  - Replace “Select workout” buttons with card “Check details” buttons.
  - Open the dialog, assert default Overview, then click movement tabs.
  - Chart aria labels remain `{movement} — weight vs reps (area = volume) on {date}`.
  - Update deletion/fallback assertions to card counts and dialog closure.
- `e2e/progress-crud-flow.spec.ts`
  - Update the history leg to open the card dialog and find the movement chart there.
  - Delete via the card action.
- `e2e/movements.spec.ts`
  - Keep list-item and link-by-name assertions; search is additive.
- `e2e/movement-progress.spec.ts`
  - Keep heading, metric select, chart aria labels, and empty-state text.
- `e2e/weight-tracking.spec.ts`
  - Scope entry assertions to `data-testid="weight-entry"` where summary values could also
    match “184 lbs”.
  - Keep chart aria label, delete button, and `data-recorded-at` checks.
- `e2e/auth.spec.ts`
  - Keep the “Logged in as” footer on desktop; logout behavior and button names unchanged.
- Add one mobile layout test (new file or a dedicated test) that sets a 390×844 viewport and
  asserts: sidebar hidden, bottom nav visible, page has no horizontal overflow, and the main
  region scrolls.

## 14. Implementation constraints

- Use Bun for scripts and package management (`bun run typecheck`, `bun run test`).
- Keep server functions in `*.functions.ts`; no server-only imports leak into client code.
- Do not add schema fields. `getWorkoutHistoryServerFn` already returns sets with
  `createdAt` and movement data.
- Do not change mutation behavior or optimistic-update semantics.
- Preserve existing accessible names and text where tests depend on them, unless the new
  structure makes that impossible; in that case update the test, not the behavior.
- Use `Intl.DateTimeFormat` for all dates/times. Use `en-US` to match the current app.
- Use `formatNumber`/`toLocaleString("en-US")` for volume and reps.
- Keep the existing `WeightInput` contract and digit-only filtering.
- Remove unused `@better-bookkeeping/ui` references from docs only if they are confirmed stale;
  do not touch the dependency list for this refactor. The app currently imports local
  components from `@/components/ui`.

## 15. Builder calls made in this document

These were decided here, not by the user, and can be revisited during review:

- Manrope as the single UI typeface.
- Movement charts use bubbles (area = volume) rather than a filled area under a weight/reps
  line, because the shaded area under a line would not equal volume.
- Overview chart uses the six-workout window ending at the selected workout, only movements
  from that workout, top 5 + “Other”, with the selected date marked.
- The open workout lives in `?workout=<id>` so mobile Back closes the dialog and deep links
  work.
- Radix primitives for dialog/tabs/tooltip/popover.
- Immediate delete with no confirmation.
- Keeping “Logged in as” in the desktop sidebar.
- Full-screen dialog on mobile.
- No workout duration.
- No schema changes.

## 16. Success criteria

- At 390px: no horizontal overflow, bottom navigation works, and every page scrolls to its
  last element.
- At 1280px: fixed sidebar, independently scrolling content, no black borders.
- All shared components draw from the same tokens; no page-level color or border inventions.
- Workout History cards show date, time, movement summary, Check Details, and Delete.
- The detail modal has Overview + per-movement tabs; Overview shows a stacked volume trend;
  movement tabs show weight on x, reps on y, and volume-sized bubbles.
- Typecheck passes; the e2e suite passes with only UI-selector updates.
- Keyboard-only and screen-reader smoke checks pass for the shell, tabs, dialog, and forms.
