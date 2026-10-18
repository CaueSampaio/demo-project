import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { deleteWorkoutsServerFn } from "@/lib/workouts.server";
import { Trash2 } from "lucide-react";
import { workoutHistoryQueryOptions } from "./-queries/workout-history";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { JSX } from "react";
import { dot, colorLegend, colorLegendItems, defineChart, lineY } from "@tanstack/charts";
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

/** One chart point per SET: its 1-based position in the workout plus the
 * three per-set metrics (weight, reps, weight × reps). */
type SetSample = {
  setIndex: number;
  movementName: string;
  maxWeight: number;
  totalReps: number;
  totalVolume: number;
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

/** Ordinal label for a position index: "1st", "2nd", ..., "11th"/"12th"/"13th". */
const ordinalLabel = (position: number) => {
  const mod100 = position % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${position}th`;
  const suffixes = ["th", "st", "nd", "rd"] as const;
  return `${position}${suffixes[position % 10] ?? "th"}`;
};

function MetricSetChart({
  samples,
  metricLabel,
  metricKey,
  movementColors,
  ariaLabel,
}: {
  samples: SetSample[];
  metricLabel: string;
  metricKey: MetricKey;
  movementColors: { movementName: string; color: string }[];
  ariaLabel: string;
}): JSX.Element {
  const rows = samples.map((sample) => ({
    setIndex: sample.setIndex,
    movementName: sample.movementName,
    value: sample[metricKey],
  }));
  // 1..N tick values keep every set position labeled (tick count would snap
  // to scale candidates and hide the final position for small N).
  const tickValues = rows.map((row) => row.setIndex);

  return (
    <Chart
      definition={defineChart({
        marks: [
          // One line + dots per MOVEMENT: repeated runs of the same movement
          // connect into its own trajectory across the workout's sets.
          // `lineY` renders nothing for a single-point series; the dot covers
          // it (same caveat as the weight-chart recipe).
          lineY(rows, { x: "setIndex", y: "value", color: "movementName" }),
          dot(rows, { x: "setIndex", y: "value", color: "movementName" }),
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
          // x = set sequence position within the workout; ticks show ordinals
          // (movement names live in the legend, not on the category axis).
          x: {
            scale: scaleLinear,
            nice: true,
            grid: true,
            axis: {
              ticks: { values: tickValues, format: (value) => ordinalLabel(Number(value)) },
            },
          },
          y: {
            scale: scaleLinear,
            nice: true,
            grid: true,
            axis: { label: metricLabel },
          },
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
  // Charts consume `workout.sets` in NATURAL DB ORDER (no migration; the user
  // ruling explicitly relies on the row order the server fn returns — Postgres
  // does not guarantee it; if it ever proves flaky, the fix is a Set.createdAt
  // migration, out of scope now). Each set becomes one point at its 1-based
  // position in the workout, carrying all three per-set metrics.
  const setSamples: SetSample[] = (selectedWorkout?.sets ?? []).map((set, index) => ({
    setIndex: index + 1,
    movementName: set.movement.name,
    maxWeight: set.weight,
    totalReps: set.reps,
    totalVolume: set.weight * set.reps,
  }));
  // Distinct movements in order of appearance (Map preserves insertion order)
  // drive the deterministic palette so a movement keeps the same color across
  // all three charts and the legend; the numbers blocks stay alphabetical.
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
  // Each movement's runs, in performed order (natural `workout.sets` order is
  // preserved by this fold — see the set-order comment above).
  const runsByMovement = new Map<string, { weight: number; reps: number }[]>();
  for (const set of selectedWorkout?.sets ?? []) {
    const runs = runsByMovement.get(set.movement.id) ?? [];
    runs.push({ weight: set.weight, reps: set.reps });
    runsByMovement.set(set.movement.id, runs);
  }

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
                  <MetricSetChart
                    key={key}
                    samples={setSamples}
                    metricKey={key}
                    metricLabel={label}
                    movementColors={movementColors}
                    ariaLabel={`${selectedDate} — ${label} by set`}
                  />
                ))}
              </div>
              {movementSummaries.map((movement) => (
                <div key={movement.movementId} className="space-y-2">
                  <p className="font-medium">{movement.movementName}</p>
                  {/* Each run of the movement, in performed order. The run
                      ordinal counts this movement's runs (1st/2nd run of the
                      movement), while the charts index sets by their position
                      within the whole workout. */}
                  <ul className="space-y-1">
                    {runsByMovement.get(movement.movementId)!.map((run, index) => (
                      <li key={index} className="text-xs text-slate-500">
                        {ordinalLabel(index + 1)}: {formatNumber(run.weight)} lbs ×{" "}
                        {formatNumber(run.reps)}
                      </li>
                    ))}
                  </ul>
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
