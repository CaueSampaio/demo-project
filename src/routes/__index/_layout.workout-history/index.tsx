import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { deleteWorkoutsServerFn } from "@/lib/workouts.functions";
import { Trash2 } from "lucide-react";
import { workoutHistoryQueryOptions } from "./-queries/workout-history";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { JSX } from "react";
import { lineY, dot, defineChart } from "@tanstack/charts";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scaleSqrt } from "d3-scale";
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

/** One chart point per RUN of ONE movement: reps (x), weight (y), and
 * volume = weight × reps (the bubble's painted area). */
type SetSample = {
  reps: number;
  weight: number;
  volume: number;
  movementName: string;
};

/** Largest painted-bubble radius in pixels (area ∝ volume via scaleSqrt). */
const MAX_BUBBLE_RADIUS = 22;

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

function MovementBubbleChart({
  runs,
  movementColor,
  ariaLabel,
}: {
  runs: SetSample[];
  movementColor: string;
  ariaLabel: string;
}): JSX.Element {
  // d3 scaleSqrt over [0, maxVolume] → [0, MAX_BUBBLE_RADIUS]: scaleSqrt maps
  // radius = sqrt(volume normalized), so the PAINTED AREA of each bubble is
  // proportional to that set's volume (weight × reps).
  const maxVolume = Math.max(...runs.map((run) => run.volume), 1);
  const radiusScale = scaleSqrt<number>()
    .domain([0, maxVolume])
    .range([0, MAX_BUBBLE_RADIUS]);

  return (
    <Chart
      definition={defineChart({
        marks: [
          // The movement's own runs connected in PERFORMED order (1st run →
          // 2nd run → …): `lineY` draws through the datum order. `lineY`
          // renders nothing for a single-point series; the dot covers it.
          lineY(runs, { x: "reps", y: "weight", color: "movementName" }),
          // One bubble per RUN. Points sharing identical (reps, weight)
          // overlap exactly — accepted trade-off per the ADDENDUM 6 ruling
          // (the run list below enumerates those runs explicitly).
          dot(runs, {
            x: "reps",
            y: "weight",
            r: "volume",
            rScale: radiusScale,
            color: "movementName",
            fillOpacity: 0.75,
          }),
        ],
        // One series per chart (this movement only): the color scale maps its
        // name to the same palette color the movement blocks/chart headings use.
        color: {
          domain: runs.map((run) => run.movementName),
          range: [movementColor],
        },
        scales: {
          x: {
            scale: scaleLinear,
            nice: true,
            grid: true,
            axis: { label: "Reps" },
          },
          y: {
            scale: scaleLinear,
            nice: true,
            grid: true,
            axis: { label: "Weight (lbs)" },
          },
        },
        tooltip,
      })}
      height={320}
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
  // Chart runs consume `workout.sets` in NATURAL DB ORDER (no migration; the
  // user ruling explicitly relies on the row order the server fn returns —
  // Postgres does not guarantee it; if it ever proves flaky, the fix is a
  // Set.createdAt migration, out of scope now). Each movement's runs come
  // from that natural order via `runsByMovement` below and are charted in
  // PERFORMED order; the connection line must follow it, not the x axis.
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
  // Same movement ⇒ same color across its chart (line + dots) and heading
  // (assigned by appearance order; cycles deterministically beyond the
  // palette size).
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
              {/* One encoding caption for all charts. */}
              <p className="text-xs text-slate-500">Area = volume (weight × reps)</p>
              {movementSummaries.map((movement) => (
                <div key={movement.movementId} className="space-y-2">
                  {/* Chart heading = movement name (identifies the chart's
                      color; replaces the former cross-chart legend). */}
                  <p className="font-medium">{movement.movementName}</p>
                  {/* One bubble chart per movement (alphabetical with the
                      blocks), directly above this movement's run list and
                      aggregates; only its own runs are charted, connected in
                      performed order. */}
                  <MovementBubbleChart
                    runs={runsByMovement
                      .get(movement.movementId)!
                      .map((run) => ({
                        reps: run.reps,
                        weight: run.weight,
                        volume: run.weight * run.reps,
                        movementName: movement.movementName,
                      }))}
                    movementColor={
                      movementColors.find(
                        (movementColor) => movementColor.movementId === movement.movementId,
                      )!.color
                    }
                    ariaLabel={`${movement.movementName} — weight vs reps (area = volume) on ${selectedDate}`}
                  />
                  {/* Each run of the movement, in performed order. The run
                      ordinal counts this movement's runs (1st/2nd run of the
                      movement). */}
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
