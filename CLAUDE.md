
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
- `src/components/ui/` - Reusable React components
- `src/integrations/tanstack-query/` - TanStack Query setup and providers
- `src/lib/` - Server-side domain logic and shared utilities:
  - `auth.server.ts` + `auth.consts.ts` - Auth0-based authentication (server functions + auth middleware)
  - `config.server.ts` / `config.client.ts` - Runtime configuration for server and client
  - `db.server.ts` - Prisma client with the PostgreSQL driver adapter (`@prisma/adapter-pg`)
  - `movements.server.ts` - Movement server functions (list, create)
  - `workouts.server.ts` - Workout server functions (create, complete, sets, history, delete)
  - `get-server-config.server.ts` - Server config exposed to the client at runtime
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

Server-side logic lives in `src/lib/*.server.ts` as TanStack Start server functions (`createServerFn`):

- **Auth** (`src/lib/auth.server.ts`): `getUserServerFn`, `signInServerFn`, `createAccountServerFn`, `logoutServerFn`, plus `authMiddleware` for protecting functions
- **Workouts** (`src/lib/workouts.server.ts`): `createWorkoutServerFn`, `getCurrentWorkoutServerFn`, `completeWorkoutServerFn`, `addSetServerFn`, `deleteSetServerFn`, `getWorkoutHistoryServerFn`, `deleteWorkoutsServerFn`
- **Movements** (`src/lib/movements.server.ts`): `getMovementsServerFn`, `createMovementServerFn`
- **Config** (`src/lib/get-server-config.server.ts`): `getServerConfigServerFn` exposes server config to the client at runtime

Server functions access the database through `getServerSidePrismaClient()` from `src/lib/db.server.ts`, which reads `DATABASE_URL` from the server config.

## Docker Notes

- Development container runs on port 3000 (published host port 3000 -> container 3000)
- Uses user ID/group ID mapping for file permissions
- Volume mounts ensure local development experience with Docker benefits
