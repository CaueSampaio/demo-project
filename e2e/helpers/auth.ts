import crypto from "node:crypto";
import type { Cookie } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../prisma/generated/client/client";

const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/demo_project";

const COOKIE_SECRET = process.env.E2E_COOKIE_SECRET ?? "change-me-in-production";

const sessionCookieName: string = "session";

let _prismaClient: PrismaClient | null = null;

function getTestPrismaClient(): PrismaClient {
  if (!_prismaClient) {
    const adapter = new PrismaPg({ connectionString: DATABASE_URL });
    _prismaClient = new PrismaClient({ adapter });
  }
  return _prismaClient;
}

/** Lazily-instantiated Prisma client for the dev database, exported so tests can assert DB state directly. */
export const testPrisma = getTestPrismaClient();

/**
 * Creates a throwaway user directly in the dev database for e2e tests.
 */
export async function createTestUser(): Promise<{ id: string; email: string }> {
  const prisma = getTestPrismaClient();
  const user = await prisma.user.create({
    data: {
      email: `e2e-${crypto.randomUUID()}@test.local`,
      name: "E2E User",
      password: "e2test-password",
    },
  });
  return { id: user.id, email: user.email };
}

/**
 * Seeds fixed-timestamp weight entries for a user directly in the dev
 * database, so ordering/gap tests do not depend on wall-clock time.
 * Rows sharing the same `daysAgo` are offset by one hour per occurrence so
 * `recordedAt` values stay unique (stable ordering) on the same calendar day.
 */
export async function seedWeights(
  userId: string,
  rows: { daysAgo: number; weightLbs: number }[],
): Promise<void> {
  const prisma = getTestPrismaClient();
  const seenDays = new Map<number, number>();
  await prisma.bodyWeightRecord.createMany({
    data: rows.map(({ daysAgo, weightLbs }) => {
      const sameDayIndex = seenDays.get(daysAgo) ?? 0;
      seenDays.set(daysAgo, sameDayIndex + 1);
      return {
        userId,
        weightLbs,
        recordedAt: new Date(
          Date.now() - daysAgo * 86_400_000 - sameDayIndex * 3_600_000,
        ),
      };
    }),
  });
}

/**
 * Seeds a completed workout for a user directly in the dev database and
 * returns its id. Movements are global (no userId) with non-unique names, so
 * each unique `movementName` is resolved find-first-or-create (`isBodyweight:
 * false` on created movements, since workouts only consume regular
 * movements). `completedAt` uses the same `daysAgo` pattern as `seedWeights`.
 */
export async function seedCompletedWorkout(
  userId: string,
  workout: { daysAgo: number; sets: { movementName: string; weight: number; reps: number }[] },
): Promise<string> {
  const prisma = getTestPrismaClient();

  const movementIds = new Map<string, string>();
  for (const movementName of new Set(workout.sets.map((s) => s.movementName))) {
    let movement = await prisma.movement.findFirst({ where: { name: movementName } });
    if (!movement) {
      movement = await prisma.movement.create({
        data: { name: movementName, isBodyweight: false },
      });
    }
    movementIds.set(movementName, movement.id);
  }

  const created = await prisma.workout.create({
    data: { userId, completedAt: new Date(Date.now() - workout.daysAgo * 86_400_000) },
  });

  await prisma.set.createMany({
    data: workout.sets.map(({ movementName, weight, reps }) => ({
      workoutId: created.id,
      movementId: movementIds.get(movementName)!,
      reps,
      weight,
    })),
  });

  return created.id;
}

/**
 * Forges the signed session cookie the server would set, so tests skip the
 * auth flow. Signature matches src/lib/auth.server.ts (HMAC-SHA256 of the
 * user ID keyed with COOKIE_SECRET).
 */
export function sessionCookieFor(userId: string): Cookie[] {
  const signature = crypto.createHmac("sha256", COOKIE_SECRET).update(userId).digest("hex");
  return [
    {
      name: sessionCookieName,
      value: `${userId}.${signature}`,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ];
}
