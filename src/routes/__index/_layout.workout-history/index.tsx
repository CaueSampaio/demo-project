import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { deleteWorkoutsServerFn } from "@/lib/workouts.server";
import { Trash2 } from "lucide-react";
import { workoutHistoryQueryOptions } from "./-queries/workout-history";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { METRICS, metricSeries, type MetricKey } from "@/lib/metrics";
import { MetricChart } from "@/components/progress-chart";

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export const Route = createFileRoute("/__index/_layout/workout-history/")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(workoutHistoryQueryOptions());
  },
  component: WorkoutHistoryPage,
});

function WorkoutHistoryPage() {
  const queryClient = useQueryClient();
  const { data: workouts } = useSuspenseQuery(workoutHistoryQueryOptions());

  const deleteWorkoutsMutation = useMutation({
    mutationFn: (workoutIds: string[]) => deleteWorkoutsServerFn({ data: { workoutIds } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workoutHistoryQueryOptions().queryKey });
    },
  });

  // Get all unique movements across all completed workouts
  const uniqueMovements = Array.from(
    new Map(workouts.flatMap((w) => w.sets.map((s) => [s.movement.id, s.movement.name]))).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1]));

  const [movementIdSelection, setMovementIdSelection] = useState<string | null>(null);
  const [metric, setMetric] = useState<MetricKey>("maxWeight");

  // Default to the (alphabetically) first movement; fall back to it whenever the
  // persisted selection disappears (e.g. its last workout was deleted).
  const selectedMovementId =
    movementIdSelection && uniqueMovements.some(([id]) => id === movementIdSelection)
      ? movementIdSelection
      : uniqueMovements[0]?.[0];
  const selectedMovementName = uniqueMovements.find(([id]) => id === selectedMovementId)?.[1];

  if (workouts.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-slate-900">Workout History</h1>
        </div>
        <Card>
          <CardContent>
            <p className="text-sm text-slate-500">No completed workouts yet.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Workout History</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="min-w-48 flex-1">
              <label className="sr-only" htmlFor="movement-select">
                Movement
              </label>
              <Select
                aria-label="Movement"
                id="movement-select"
                value={selectedMovementId}
                onChange={(event) => setMovementIdSelection(event.target.value)}>
                {uniqueMovements.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="min-w-48 flex-1">
              <label className="sr-only" htmlFor="metric-select">
                Metric
              </label>
              <Select
                aria-label="Metric"
                id="metric-select"
                value={metric}
                onChange={(event) => setMetric(event.target.value as MetricKey)}>
                {METRICS.map(({ key, label }) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {selectedMovementId && selectedMovementName && (
            <div className="mt-4">
              <MetricChart
                points={metricSeries(workouts, selectedMovementId, metric)}
                yLabel={METRICS.find((m) => m.key === metric)?.label ?? metric}
                ariaLabel={`${selectedMovementName} — ${METRICS.find((m) => m.key === metric)?.label} over time`}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Completed Workouts</CardTitle>
        </CardHeader>
        <CardContent>
          {workouts.length === 0 ? (
            <p className="text-sm text-slate-500">No completed workouts yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {workouts.map((workout) => (
                <li key={workout.id} className="flex items-center justify-between py-3">
                  <span className="text-sm text-slate-500">
                    {workout.completedAt ? dateFormat.format(new Date(workout.completedAt)) : "-"}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Delete workout ${workout.completedAt ? dateFormat.format(new Date(workout.completedAt)) : "-"}`}
                    disabled={deleteWorkoutsMutation.isPending}
                    onClick={() => deleteWorkoutsMutation.mutate([workout.id])}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
