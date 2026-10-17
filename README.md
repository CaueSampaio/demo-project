# Better Bookkeeping Demo App

A simple workout tracking app built with TanStack Start. Users can configure movements (e.g. bench-press, dumbbell curls), create workouts with sets, and view their workout history.

## Feature Requests

1. Add weight tracking section where a user can input their weight. This should be something they can track over time. Add a chart showing the history of that

2. The current setup doesn't support body-weight movements very well (e.g. pullups / pushups) update the "movements page" so a user can flag a movement as "body-weight" when they create it. When a "body-weight" movement is added to the current workout the weight field should default to the most recent user-inputted weight

3. The Workout history should give the user a sense of progression. One way to do this is to show certain summary metrics for each movement and their progression over time. Please implement a chart where a user can select a movement and a corresponding metric and see that metric plotted against time.
   Metrics:
   - maximum weight (the maximum weight for that movement on a given day)
   - total reps
   - total volume (volume of a set is weight \* reps, total volume for a movement is total volume of all sets in a workout)

4. There are no tests! Please implement the e2e tests in the `e2e/` directory using Playwright. The test scaffolding is already set up - you just need to implement the test cases:
   - `e2e/movements.spec.ts` - Movement CRUD operations
   - `e2e/sets.spec.ts` - Set CRUD operations
   - `e2e/workouts.spec.ts` - Workout CRUD operations

5. **Security Fix**: The authentication system stores passwords in plaintext. Please implement proper password hashing using a secure algorithm (e.g., bcrypt, argon2). Update the sign-up and sign-in flows accordingly.

### Stretch Goals

- Get creative - how would you add nutrition tracking to this app? Macros (Carb / Protein / Fats) and Calories & Calorie surplus/deficit
- Database design / performance upgrade - let us know what we're doing wrong. Show us how you would tackle harder problems like admin boards to summarize users in the system
- Security audit / improvement - beyond password hashing, what other security improvements would you make? Consider things like rate limiting, CSRF protection, or session management
- General UI cleanup / update - the UI here is totally basic. Show us some improvements you'd make to make this app look clean and professional

There will be a code review on what you write! So be prepared to explain how and why you implemented these features.

Please use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/#summary) as you're working on this repo.

## Tech Stack

- **Framework**: TanStack Start (React SSR)
- **Router**: TanStack Router (file-based routing)
- **State Management**: TanStack Query + TanStack Form
- **Database**: PostgreSQL + Prisma
- **Styling**: Tailwind CSS v4
- **Runtime**: Bun
- **Testing**: Playwright (e2e)

## Development

### Prerequisites

- Bun runtime installed
- Docker (for PostgreSQL)

### Getting Started

```bash
# Install dependencies
bun install

# Copy environment variables
cp .env.local.example .env.local

# Start development server with Docker (includes PostgreSQL)
bun run dev

# Stop services
bun run dev:down
```

### Available Scripts

- `bun run dev` - Start development server with Docker
- `bun run dev:down` - Stop Docker services
- `bun run build` - Build for production
- `bun run test` - Run e2e tests with Playwright
- `bun run test:ui` - Run e2e tests with Playwright UI
- `bun run typecheck` - Run TypeScript type checking
- `bun run db:migrate` - Run database migrations

## Project Structure

```
src/
├── routes/           # File-based routing
├── components/       # Reusable components
└── lib/              # Business logic & server functions
prisma/
├── schema.prisma     # Database schema
└── migrations/       # Database migrations
```
