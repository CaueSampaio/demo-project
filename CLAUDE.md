
@sessions/CLAUDE.sessions.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Package Manager

This project uses **Bun** as the package manager and runtime.

### Local Development

- `bun run dev` - Start development server on port 3000
- `bun run build` - Build for production
- `bun run start` - Start production server
- `bun run test` - Run tests with Vitest

### Docker Development

- `bun run dev:docker` or `./scripts/dev.sh up` - Start full Docker development environment (port 3000)
- `bun run dev:docker:down` or `./scripts/dev.sh down` - Stop Docker services

The Docker setup uses volume mounts for hot reloading and ensures TypeScript type generation works locally.

## Architecture Overview

### Tech Stack

- **Framework**: TanStack Start (React SSR framework)
- **Router**: TanStack Router (file-based routing)
- **State Management**: TanStack Query for server state
- **Forms**: TanStack Form
- **Styling**: Tailwind CSS v4 + Better Bookkeeping UI component library
- **Testing**: Vitest + React Testing Library
- **TypeScript**: Strict mode enabled with path aliases (`@/*`)

### Project Structure

- `src/routes/` - File-based routing (TanStack Router auto-generates `routeTree.gen.ts`)
- `src/components/` - Reusable React components
- `src/integrations/tanstack-query/` - TanStack Query setup and providers
- `src/hooks/` - Custom React hooks
- `src/lib/stripe/` - Stripe integration (subscriptions, checkout, utilities)
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
  - Located in `src/hooks/` for custom form implementations

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

## Stripe Integration

### Billing Flow

The onboarding flow includes a conditional billing step (step 6) that appears when users have:
- Subscriptions with `awaiting_initial_payment` status, OR
- One-time payments with `open` invoice status

### Server Functions

Stripe operations are handled via server functions in `src/lib/stripe/subscriptions.server.ts`:
- `getUserSubscriptionsServerFn` - Fetches user's subscriptions and one-time payments
- `createCheckoutSessionServerFn` - Creates Stripe embedded checkout sessions
- `markTestSubscriptionAsPaidServerFn` - Development/testing utility for test subscriptions

### Dynamic Step Indicator

The `useTotalSteps` hook (`src/hooks/use-total-steps.ts`) dynamically calculates total steps:
- Returns 6 if user has pending payments (shows billing step)
- Returns 5 if no pending payments (skips billing step)
- All step routes should use this hook and pass `totalSteps` to `OnboardingStepLayout`

### Configuration

Stripe configuration requires:
- **Server config** (`src/lib/config.server.ts`): `stripe.secretKey`
- **Client config** (`src/lib/config.client.ts`): `stripe.publicKey` (via `VITE_STRIPE_PUBLIC_KEY`)
- Stripe client uses singleton pattern with API version `2025-11-17.clover`

### Webhook Dependency

The onboarding app **does not handle Stripe webhooks**. Subscription status updates after checkout depend on the main Abacus app's Stripe sync service processing webhook events. After successful checkout, the app waits 2.5 seconds for webhook processing before refetching subscription data.

## Docker Notes

- Development container runs on port 3000 (published host port 3000 -> container 3000)
- Uses user ID/group ID mapping for file permissions
- Volume mounts ensure local development experience with Docker benefits
