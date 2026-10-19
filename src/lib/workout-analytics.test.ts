import { describe, expect, test } from "bun:test";
import { summarizeMovements, summarizeWorkout, type WorkoutLike } from "./workout-analytics";

const workout = (id: string, daysAgo: number, sets: WorkoutLike["sets"]): WorkoutLike => ({
  id,
  completedAt: new Date(Date.now() - daysAgo * 86_400_000),
  sets,
});

const set = (id: string, movementId: string, name: string, weight: number, reps: number) => ({
  id,
  reps,
  weight,
  createdAt: new Date(),
  movement: { id: movementId, name, isBodyweight: false },
});

const w1 = workout("w1", 3, [
  set("s1", "m1", "Alpha Bench", 135, 10),
  set("s2", "m1", "Alpha Bench", 145, 8),
  set("s3", "m2", "Zulu Squat", 225, 5),
]);

describe("summaries", () => {
  test("summarizes a workout", () => {
    expect(summarizeWorkout(w1)).toEqual({
      setCount: 3,
      movementCount: 2,
      totalVolume: 135 * 10 + 145 * 8 + 225 * 5,
    });
  });

  test("groups and sorts movements, keeping set order", () => {
    const [alpha, zulu] = summarizeMovements(w1);
    expect(alpha).toMatchObject({
      movementId: "m1",
      movementName: "Alpha Bench",
      setCount: 2,
      totalReps: 18,
      maxWeight: 145,
      totalVolume: 135 * 10 + 145 * 8,
    });
    expect(alpha.sets.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(zulu.movementName).toBe("Zulu Squat");
  });
});
