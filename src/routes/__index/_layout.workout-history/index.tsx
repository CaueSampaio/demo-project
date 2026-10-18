import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { deleteWorkoutsServerFn } from "@/lib/workouts.server";
import { Trash2 } from "lucide-react";
import { workoutHistoryQueryOptions } from "./-queries/workout-history";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { JSX } from "react";
import { barX, colorLegend, colorLegendItems, defineChart } from "@tanstack/charts";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/charts/react";
import { METRICS, metricSeries, type MetricKey } from "@/lib/metrics";

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const formatNumber = (value: number) => value.toLocaleString("en-US");

const UNITS: Record<MetricKey, string> = {
  maxWeight: "lbs",
  totalReps: "reps",
  totalVolume: "volume",
};

const metricValue = (
  workout: NonNullable<unknown>,
  movementId: string,
  metric: MetricKey,
): number => metricSeries([workout as never], movementId, metric)[0]?.value ?? 0;

export const Route = createFileRoute("/__index/_layout/workout-history/")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(workoutHistoryQueryOptions());
  },
  component: WorkoutHistoryPage,
});

type MovementSummary = {
  movementId: string;
  movementName: string;
  values: Record<MetricKey, number>;
};

// ~8 distinct, light-theme friendly hexes (Tailwind 600-ish tones). Movements
// beyond the palette size cycle deterministically (no crash).
const MOVEMENT_PALETTE = [
  "#2563eb",
  "#16a34a",
  "#ea580c",
  "#9333ea",
  "#0891b2",
  "#ca8a04",
  "#dc2626",
  "#059669",
] as const;

/** Ordinal label for the movement's order in the workout: "1st", "2nd", ... */
const ordinalLabel = (position: number) => {
  const mod100 = position % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${position}th`;
  const suffixes = ["th", "st", "nd", "rd"] as const;
  return `${position}${suffixes[position % 10] ?? "th"}`;
};

function MetricBarChart({
  rows,
  metricLabel,
  movementColors,
  ariaLabel,
}: {
  rows: { ordinal: string; movementName: string; value: number }[];
  metricLabel: string;
  movementColors: { movementName: string; color: string }[];
  ariaLabel: string;
}): JSX.Element {
  return (
    <Chart
      definition={defineChart({
        marks: [
          barX(rows, {
            y: "ordinal",
            x: "value",
            // Color channel = movement name: identical color → movement
            // mapping in all three charts, and it populates the legend.
            color: "movementName",
            inset: 12,
            maxThickness: 48,
          }),
        ],
        color: {
          domain: movementColors.map(({ movementName }) => movementName),
          range: movementColors.map(({ color }) => color),
          legend: colorLegend({
            placement: "bottom",
            items: colorLegendItems({ indicator: { shape: "dot" } }),
          }),
        },
        scales: {
          x: {
            scale: scaleLinear,
            nice: true,
            grid: true,
            axis: { label: metricLabel },
          },
          // Category axis = movement order, so ticks render ordinals; the
          // movement names live in the legend.
          y: { scale: scaleBand },
        },
        tooltip,
      })}
      height={180}
      ariaLabel={ariaLabel}
    />
  );
}

function WorkoutHistoryPage() {
  const queryClient = useQueryClient();
  const { data: workouts } = useSuspenseQuery(workoutHistoryQueryOptions());

  const deleteWorkoutsMutation = useMutation({
    mutationFn: (workoutIds: string[]) => deleteWorkoutsServerFn({ data: { workoutIds } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workoutHistoryQueryOptions().queryKey });
    },
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // The selected workout, falling back to the most recent one whenever the
  // persisted selection disappears (e.g. its workout was deleted). The data
  // is completed workouts only, already sorted by `completedAt` descending.
  const selectedWorkout =
    (selectedId ? workouts.find((workout) => workout.id === selectedId) : undefined) ??
    workouts[0];

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

  const selectedDate = selectedWorkout?.completedAt
    ? dateFormat.format(new Date(selectedWorkout.completedAt))
    : "-";
  // Distinct movements in order of appearance within the selected workout's
  // sets (Map preserves insertion order). Charts use this order for ordinal
  // bars and the deterministic palette; the numbers blocks keep the
  // approved alphabetical order.
  const appearanceOrder = Array.from(
    new Map(
      selectedWorkout?.sets.map((set) => [set.movement.id, set.movement.name]) ?? [],
    ).entries(),
  );
  const valuesByMovement = new Map(
    appearanceOrder.map(
      ([movementId]): [string, Record<MetricKey, number>] => [
        movementId,
        Object.fromEntries(
          METRICS.map(({ key }) => [key, metricValue(selectedWorkout!, movementId, key)]),
        ) as Record<MetricKey, number>,
      ],
    ),
  );
  const movementSummaries: MovementSummary[] = appearanceOrder
    .slice()
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([movementId, movementName]) => ({
      movementId,
      movementName,
      values: valuesByMovement.get(movementId)!,
    }));
  // Same movement ⇒ same color in all three charts and the legend (assigned
  // by appearance order; cycles deterministically beyond the palette size).
  const movementColors = appearanceOrder.map(([movementId, movementName], index) => ({
    movementName,
    color: MOVEMENT_PALETTE[index % MOVEMENT_PALETTE.length] as string,
    movementId,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Workout History</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Completed Workouts</CardTitle>
        </CardHeader>
        <CardContent>
          {workouts.length === 0 ? (
            <p className="text-sm text-slate-500">No completed workouts yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {workouts.map((workout) => {
                const dateText = workout.completedAt
                  ? dateFormat.format(new Date(workout.completedAt))
                  : "-";
                return (
                  <li key={workout.id} className="flex items-center justify-between py-3">
                    <Button
                      variant="ghost"
                      className="text-sm text-slate-500"
                      aria-pressed={workout.id === selectedWorkout?.id}
                      aria-label={`Select workout ${dateText}`}
                      onClick={() => setSelectedId(workout.id)}>
                      {dateText}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Delete workout ${dateText}`}
                      disabled={deleteWorkoutsMutation.isPending}
                      onClick={() => deleteWorkoutsMutation.mutate([workout.id])}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{selectedDate}</CardTitle>
        </CardHeader>
        <CardContent>
          {movementSummaries.length === 0 ? (
            <p className="text-sm text-slate-500">No movements in this workout.</p>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-3">
                {METRICS.map(({ key, label }) => (
                  <MetricBarChart
                    key={key}
                    rows={movementColors.map((movement, index) => ({
                      ordinal: ordinalLabel(index + 1),
                      movementName: movement.movementName,
                      value: valuesByMovement.get(movement.movementId)![key],
                    }))}
                    metricLabel={label}
                    movementColors={movementColors}
                    ariaLabel={`${selectedDate} — ${label} by movement`}
                  />
                ))}
              </div>
              {movementSummaries.map((movement) => (
                <div key={movement.movementId} className="space-y-2">
                  <p className="font-medium">{movement.movementName}</p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {METRICS.map(({ key, label }) => (
                      <div key={key} className="rounded-lg border border-slate-100 p-3">
                        <p className="text-xs text-slate-500">{label}</p>
                        <p className="text-sm text-slate-900">
                          {formatNumber(movement.values[key])} {UNITS[key]}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
