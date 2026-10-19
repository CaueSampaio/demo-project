import { describe, expect, test } from "bun:test";
import {
  sixWorkoutWindow,
  summarizeMovements,
  summarizeWorkout,
  volumeOverviewSeries,
  type WorkoutLike,
} from "./workout-analytics";

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

describe("sixWorkoutWindow", () => {
  const workouts = [1, 2, 4, 6, 8, 10].map((d) => workout(`w${d}`, d, []));

  test("ends at the selected workout", () => {
    expect(sixWorkoutWindow(workouts, "w4").map((w) => w.id)).toEqual(["w10", "w8", "w6", "w4"]);
  });

  test("uses the six most recent ending at the newest selection", () => {
    expect(sixWorkoutWindow(workouts, "w1").map((w) => w.id)).toEqual(["w10", "w8", "w6", "w4", "w2", "w1"]);
  });

  test("returns no window for an unknown selection", () => {
    expect(sixWorkoutWindow(workouts, "missing")).toEqual([]);
  });
});

describe("volumeOverviewSeries", () => {
  test("only uses selected-workout movements and ends at the selected workout", () => {
    const selected = workout("selected", 2, [set("a", "m1", "Alpha", 100, 10), set("b", "m2", "Beta", 50, 10)]);
    const older = workout("older", 8, [set("c", "m1", "Alpha", 90, 10), set("d", "m3", "Gamma", 70, 10)]);
    const newer = workout("newer", 1, [set("e", "m1", "Alpha", 200, 10)]);

    const result = volumeOverviewSeries([newer, selected, older], "selected");
    expect(result.series).toEqual(["Alpha", "Beta"]);
    expect(result.selectedDate?.toISOString()).toBe(new Date(selected.completedAt!).toISOString());
    expect(result.rows).toContainEqual(expect.objectContaining({ movementName: "Alpha", volume: 1000 }));
    expect(result.rows.some((row) => row.date.toISOString() === new Date(newer.completedAt!).toISOString())).toBe(
      false,
    );
  });

  test("keeps the top five movements and aggregates the rest as Other", () => {
    const sets = Array.from({ length: 7 }, (_, i) => set(`s${i}`, `m${i}`, `Movement ${i}`, (7 - i) * 10, 10));
    const selected = workout("selected", 1, sets);
    const result = volumeOverviewSeries([selected], "selected");
    expect(result.series).toEqual(["Movement 0", "Movement 1", "Movement 2", "Movement 3", "Movement 4", "Other"]);
    expect(result.rows.filter((row) => row.movementName === "Other")).toHaveLength(1);
  });
});
