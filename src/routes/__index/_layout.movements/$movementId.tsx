import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { movementProgressQueryOptions } from "./-queries/movements";
import { useSuspenseQuery } from "@tanstack/react-query";
import { METRICS, metricSeries, type MetricKey } from "@/lib/metrics";
import { MetricChart } from "@/components/progress-chart";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { formatNumber } from "@/lib/format";

export const Route = createFileRoute("/__index/_layout/movements/$movementId")({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(movementProgressQueryOptions(params.movementId));
  },
  component: MovementProgressPage,
});

type MovementWorkout = { sets: { reps: number; weight: number }[] };

/** All-time totals folded from the movement's completed workouts. */
function summarizeMovement(workouts: MovementWorkout[]) {
  let maxWeight = 0;
  let totalReps = 0;
  let totalVolume = 0;

  for (const workout of workouts) {
    for (const set of workout.sets) {
      maxWeight = Math.max(maxWeight, set.weight);
      totalReps += set.reps;
      totalVolume += set.weight * set.reps;
    }
  }

  return { maxWeight, totalReps, totalVolume, sessions: workouts.length };
}

function MovementProgressPage() {
  const { movementId } = Route.useParams();
  const { data } = useSuspenseQuery(movementProgressQueryOptions(movementId));
  const [metric, setMetric] = useState<MetricKey>("maxWeight");

  const metricLabel = METRICS.find((m) => m.key === metric)?.label ?? metric;

  const backLink = (
    <Link
      to="/movements"
      className="inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground hover:text-foreground md:min-h-0">
      &larr; All movements
    </Link>
  );

  if (data.workouts.length === 0) {
    return (
      <div className="space-y-6">
        {backLink}
        <PageHeader title={data.movement.name} description="All-time progress" />
        <Card>
          <CardContent>
            <EmptyState
              icon={Activity}
              title="No completed workouts yet."
              description="Log a set for this movement to start tracking progress."
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const summary = summarizeMovement(data.workouts);

  return (
    <div className="space-y-6">
      {backLink}

      <PageHeader title={data.movement.name} description="All-time progress" />

      <div data-testid="movement-stats" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Max Weight" value={formatNumber(summary.maxWeight)} unit="lbs" />
        <StatCard label="Total Reps" value={formatNumber(summary.totalReps)} />
        <StatCard label="Total Volume" value={formatNumber(summary.totalVolume)} unit="lbs" />
        <StatCard label="Sessions" value={formatNumber(summary.sessions)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Progress</CardTitle>
        </CardHeader>
        <CardContent>
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
          <div className="mt-4">
            <MetricChart
              points={metricSeries(data.workouts, data.movement.id, metric)}
              yLabel={metricLabel}
              ariaLabel={`${data.movement.name} — ${metricLabel} over time`}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
