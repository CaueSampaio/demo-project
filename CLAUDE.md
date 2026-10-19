
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Package Manager

This project uses **Bun** as the package manager and runtime.

### Local Development

- `bun run dev` or `./scripts/dev.sh up` - Start full Docker development environment (port 3000)
- `bun run dev:down` or `./scripts/dev.sh down` - Stop Docker services
- `bun run build` - Build for production
- `bun run serve` - Preview the production build
- `bun run typecheck` - Run TypeScript type checking (`tsc --noEmit`)
- `bun run generate` - Generate Prisma Client
- `bun run db:migrate` - Run database migrations (`prisma migrate dev`)
- `bun run test` - Run tests with Playwright
- `bun run test:ui` - Run tests with Playwright UI mode
- `bun run format` - Format code with Prettier (`prettier --write .`)

The Docker setup uses volume mounts for hot reloading and ensures TypeScript type generation works locally.

## Architecture Overview

### Tech Stack

- **Framework**: TanStack Start (React SSR framework)
- **Router**: TanStack Router (file-based routing)
- **State Management**: TanStack Query for server state
- **Forms**: TanStack Form
- **Styling**: Tailwind CSS v4 + Better Bookkeeping UI component library
- **Testing**: Playwright (e2e tests in `e2e/`)
- **TypeScript**: Strict mode enabled with path aliases (`@/*`)

### Project Structure

- `src/routes/` - File-based routing (TanStack Router auto-generates `routeTree.gen.ts`)
- `src/start.ts` - Custom TanStack Start entry; registers TanStack Start's native CSRF request middleware (`createCsrfMiddleware`) for server functions (auto-resolved by the Start vite plugin)
- `src/components/ui/` - Reusable React components
- `src/integrations/tanstack-query/` - TanStack Query setup and providers
- `src/lib/` - Server functions (`*.functions.ts`, client-safe RPC wrappers) and server-only helpers (`*.server.ts`):
  - `auth.functions.ts` + `auth.consts.ts` - Credential-based auth server functions (`getUser`/`signIn`/`createAccount`/`logout`) and `authMiddleware`
  - `auth.server.ts` - Server-only auth helpers (HMAC session signing/verification, session cookie set/read/clear)
  - `password.server.ts` - Argon2id password hashing/verification helpers (`Bun.password`)
  - `rate-limit.server.ts` - In-memory per-IP rate limiting for auth endpoints
  - `config.server.ts` - Server-only runtime config (secrets); `config.ts` - isomorphic public config (read by client and SSR)
  - `db.server.ts` - Prisma client with the PostgreSQL driver adapter (`@prisma/adapter-pg`)
  - `movements.functions.ts` - Movement server functions (list, create)
  - `weight.functions.ts` - Body-weight server functions (list, latest, add, delete)
  - `workouts.functions.ts` - Workout server functions (create, complete, sets, history, delete)
  - `types.ts` / `utils.ts` - Shared types and utilities
- `e2e/` - Playwright end-to-end tests
- `public/` - Static assets

### Router Configuration

The app uses TanStack Router with SSR integration:

- Root route: `src/routes/__root.tsx` (includes devtools and Better Bookkeeping UI styles)
- Router factory: `src/router.tsx` (includes TanStack Query integration)
- Type-safe routing with auto-generated route tree

### State Management

This project uses a multi-layered approach to state management:

#### Server State

- **TanStack Query** (configured in `src/integrations/tanstack-query/`)
  - Handles server data fetching, caching, and synchronization
  - DevTools enabled in development for debugging
  - Integrates with TanStack Router for data loading

#### Client State Options

- **TanStack Store** - Primary recommendation for complex client state
  - Provides reactive state management with derived state support
  - Install with: `bun install @tanstack/store`
  - Example usage:

    ```tsx
    import { useStore } from "@tanstack/react-store";
    import { Store, Derived } from "@tanstack/store";

    // Basic store
    const countStore = new Store(0);

    // Derived store that updates automatically
    const doubledStore = new Derived({
      fn: () => countStore.state * 2,
      deps: [countStore],
    });
    doubledStore.mount();

    // In component
    const count = useStore(countStore);
    const doubled = useStore(doubledStore);
    ```

#### Form State

- **TanStack Form** - For complex form handling and validation
  - Type-safe form state management
  - Built-in validation and error handling

#### Data Loading Patterns

- **Route Loaders** - Use TanStack Router's built-in loader functionality for route-specific data
- **useQuery** - Use TanStack Query for component-level data fetching
- **Derived State** - Use TanStack Store's `Derived` class for computed state

### Styling System

- Uses Better Bookkeeping UI component library (`@better-bookkeeping/ui`)
- Better Bookkeeping UI is just a wrapped version of shadcn UI. You can read ./node_modules/@better-bookkeeping/ui/dist/src/components/ui to see available UI components
- Tailwind CSS v4 with Vite plugin
- Component styles imported in root route: `@better-bookkeeping/ui/theme.css` and `@better-bookkeeping/ui/component-styles.css`

### Development Tools

- TanStack DevTools panel (bottom-left) includes Router and Query devtools
- TypeScript path aliases configured (`@/*` maps to `./src/*`)
- Vite config includes TanStack Start plugin and React plugin
- You run in an environment where ast-grep is available. Whenever a search requires syntax-aware or structural matching, default to `ast-grep run --lang tsx -p '<pattern>'` (or set lang appropriately) and avoid falling back to text-only tools like `rg` or `grep` unless I explicitly request a plain-text search.

## Server Functions

Server functions are declared with `createServerFn` and live in client-safe `src/lib/*.functions.ts` modules (client importers receive RPC stubs). A `*.functions.ts` file may statically import only `@tanstack/react-start`, `@tanstack/react-router`, `zod` and types; everything server-only (`db.server`, `password.server`, `rate-limit.server`, auth helpers) is reached with `await import("...")` **inside** the handler body. Server-only helpers live in `src/lib/*.server.ts` and are never statically imported by client-visible code — so no client-loadable module ever pulls in a `.server.ts` module or the `@tanstack/react-start/server` barrel (the hydration invariant is now structural, not just convention).

- **Auth** (`src/lib/auth.functions.ts`): `getUserServerFn`, `signInServerFn`, `createAccountServerFn`, `logoutServerFn`, plus `authMiddleware` for protecting functions. Server-only helpers (HMAC signing/verification, session cookie set/read/clear) live in `src/lib/auth.server.ts`. Passwords are hashed with argon2id (`src/lib/password.server.ts`). CSRF protection uses TanStack Start's native `createCsrfMiddleware` (framework `@tanstack/react-start@1.168.61`), registered **once** on `requestMiddleware` in `src/start.ts` (the custom TanStack Start entry: `createStart(() => ({ requestMiddleware: [createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" })] }))`), so it applies to every server function — no per-fn middleware attachments. The strict default is kept: requests without `Sec-Fetch-Site`/`Origin`/`Referer` are rejected (403). The dev-only `/api/dev-reset-rate-limits` route is not a server function, so it installs the same middleware itself.
- **Workouts** (`src/lib/workouts.functions.ts`): `createWorkoutServerFn`, `getCurrentWorkoutServerFn`, `completeWorkoutServerFn`, `addSetServerFn`, `deleteSetServerFn`, `getWorkoutHistoryServerFn`, `deleteWorkoutsServerFn`
- **Movements** (`src/lib/movements.functions.ts`): `getMovementsServerFn`, `createMovementServerFn`
- **Weight** (`src/lib/weight.functions.ts`): `getWeightsServerFn`, `getLatestBodyWeightServerFn`, `addBodyWeightServerFn`, `deleteWeightServerFn`

Server functions access the database through `getServerSidePrismaClient()` from `src/lib/db.server.ts`, awaited inside the handler.

**Import protection.** `vite.config.ts` leaves TanStack Start's import-protection defaults untouched: client code cannot import `**/*.server.*` (or the `@tanstack/*-start/server` specifiers), and server code cannot import `**/*.client.*`. The `*.functions.ts` / `*.server.ts` split above is what lets the defaults hold unaided — a leak fails the production build rather than shipping a broken client graph.

## Docker Notes

- Development container runs on port 3000 (published host port 3000 -> container 3000)
- Dev boots Vite (and all server functions) under the Bun runtime: `CMD ["bun", "--bun", "vite", "dev", ...]` — Bun-only APIs like `Bun.password` work in dev, not just production
- Uses user ID/group ID mapping for file permissions
- Volume mounts ensure local development experience with Docker benefits
