import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { movementProgressQueryOptions } from "./-queries/movements";
import { useSuspenseQuery } from "@tanstack/react-query";
import { METRICS, metricSeries, type MetricKey } from "@/lib/metrics";
import { MetricChart } from "@/components/progress-chart";

export const Route = createFileRoute("/__index/_layout/movements/$movementId")({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(movementProgressQueryOptions(params.movementId));
  },
  component: MovementProgressPage,
});

function MovementProgressPage() {
  const { movementId } = Route.useParams();
  const { data } = useSuspenseQuery(movementProgressQueryOptions(movementId));
  const [metric, setMetric] = useState<MetricKey>("maxWeight");

  const metricLabel = METRICS.find((m) => m.key === metric)?.label ?? metric;

  if (data.workouts.length === 0) {
    return (
      <div className="space-y-6">
        <Link to="/movements" className="text-sm text-slate-600 hover:text-slate-900">
          &larr; All movements
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">{data.movement.name}</h1>
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
      <Link to="/movements" className="text-sm text-slate-600 hover:text-slate-900">
        &larr; All movements
      </Link>

      <h1 className="text-2xl font-semibold text-slate-900">{data.movement.name}</h1>

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
