export type MetricKey = "maxWeight" | "totalReps" | "totalVolume";

export const METRICS: { key: MetricKey; label: string }[] = [
  { key: "maxWeight", label: "Max Weight" },
  { key: "totalReps", label: "Total Reps" },
  { key: "totalVolume", label: "Total Volume" },
];

export type HistoryWorkoutLike = {
  id: string;
  completedAt: Date | string | null;
  sets: { movementId: string; reps: number; weight: number }[];
};

type MetricPoint = { workoutId: string; date: Date; value: number };

/** One series point per workout: completed workouts (`completedAt != null`)
 * containing `movementId` only, ascending by date.
 *
 * Rows serialize to ISO strings crossing the server-fn boundary, so
 * `completedAt` is accepted as `Date | string`. */
export function metricSeries(workouts: HistoryWorkoutLike[], movementId: string, metric: MetricKey): MetricPoint[] {
  const points: MetricPoint[] = [];

  for (const workout of workouts) {
    if (workout.completedAt == null) continue;

    const sets = workout.sets.filter((set) => set.movementId === movementId);
    if (sets.length === 0) continue;

    let value: number;
    if (metric === "maxWeight") {
      value = Math.max(...sets.map((set) => set.weight));
    } else if (metric === "totalReps") {
      value = sets.reduce((sum, set) => sum + set.reps, 0);
    } else {
      value = sets.reduce((sum, set) => sum + set.weight * set.reps, 0);
    }

    points.push({ workoutId: workout.id, date: new Date(workout.completedAt), value });
  }

  return points.sort((a, b) => a.date.getTime() - b.date.getTime());
}
