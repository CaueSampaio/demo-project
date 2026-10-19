import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../prisma/generated/client/client";

const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/demo_project";

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
 * each unique movement is resolved find-first-or-create (`isBodyweight: false`
 * on created movements unless a `{ name, isBodyweight }` spec is given, since
 * string names are shorthand for regular movements). `completedAt` uses the
 * same `daysAgo` pattern as `seedWeights`.
 */
export async function seedCompletedWorkout(
  userId: string,
  workout: {
    daysAgo: number;
    sets: {
      movementName: string | { name: string; isBodyweight: boolean };
      weight: number;
      reps: number;
    }[];
  },
): Promise<string> {
  const prisma = getTestPrismaClient();

  const movementIds = new Map<string, string>();
  const specs = new Map<string, { name: string; isBodyweight: boolean }>();
  for (const set of workout.sets) {
    const spec =
      typeof set.movementName === "string"
        ? { name: set.movementName, isBodyweight: false }
        : set.movementName;
    specs.set(spec.name, spec);
  }
  for (const spec of specs.values()) {
    let movement = await prisma.movement.findFirst({ where: { name: spec.name } });
    if (!movement) {
      movement = await prisma.movement.create({
        data: { name: spec.name, isBodyweight: spec.isBodyweight },
      });
    }
    movementIds.set(spec.name, movement.id);
  }

  const created = await prisma.workout.create({
    data: { userId, completedAt: new Date(Date.now() - workout.daysAgo * 86_400_000) },
  });

  await prisma.set.createMany({
    data: workout.sets.map((set) => ({
      workoutId: created.id,
      movementId: movementIds.get(
        typeof set.movementName === "string" ? set.movementName : set.movementName.name,
      )!,
      reps: set.reps,
      weight: set.weight,
    })),
  });

  return created.id;
}
