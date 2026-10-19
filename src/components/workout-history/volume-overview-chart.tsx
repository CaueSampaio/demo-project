import type { CSSProperties, JSX } from "react";
import { areaY, defineChart, stack, type ChartPoint } from "@tanstack/charts";
import { scaleUtc } from "d3-scale";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/charts/react";
import { formatNumber, formatWorkoutDate } from "@/lib/format";
import { volumeOverviewSeries, type VolumeRow, type WorkoutLike } from "@/lib/workout-analytics";
import { useChartHeight } from "./use-chart-height";

type VolumeOverviewChartProps = {
  workouts: WorkoutLike[];
  selectedWorkoutId: string;
};

// Paper & Ink chart theme: warm muted grid over the paper card. Colors resolve
// through the design tokens, never literals.
const CHART_THEME = {
  foreground: "var(--color-foreground)",
  muted: "var(--color-muted-foreground)",
  grid: "var(--color-border)",
  background: "var(--color-card)",
  palette: [
    "var(--color-chart-1)",
    "var(--color-chart-2)",
    "var(--color-chart-3)",
    "var(--color-chart-4)",
    "var(--color-chart-5)",
  ],
};

// The tooltip element is appended inside the chart host, so declaring these on
// the host inherits them into the tooltip the library paints.
const TOOLTIP_STYLE = {
  "--ts-chart-tooltip-background": "var(--color-card)",
  "--ts-chart-tooltip-color": "var(--color-foreground)",
  "--ts-chart-tooltip-border": "1px solid var(--color-border)",
  "--ts-chart-tooltip-border-radius": "var(--radius-control)",
  "--ts-chart-tooltip-shadow": "var(--shadow-sm)",
} as CSSProperties;

/** Ranked movements use chart-1…chart-5; the aggregated remainder is neutral. */
const OTHER_COLOR = "var(--color-muted-foreground)";

function seriesColor(name: string, index: number): string {
  if (name === "Other") return OTHER_COLOR;
  return CHART_THEME.palette[index] ?? CHART_THEME.palette[CHART_THEME.palette.length - 1]!;
}

/** Soft stacked areas with a thin boundary stroke and a grouped, per-movement tooltip. */
function overviewDefinition(rows: VolumeRow[], series: string[]) {
  const summary = (points: readonly ChartPoint<VolumeRow, Date, number>[]) => {
    const date = points[0]?.xValue;
    const heading = date instanceof Date ? formatWorkoutDate(date) : String(date ?? "");
    return [heading, ...points.map((point) => `${point.groupLabel}: ${formatNumber(point.datum.volume)}`)].join("\n");
  };

  return defineChart({
    marks: [
      areaY(rows, {
        x: "date",
        y: "volume",
        z: "movementName",
        color: "movementName",
        layout: stack({ order: series }),
        fillOpacity: 0.55,
        stroke: (row) => seriesColor(row.movementName, series.indexOf(row.movementName)),
        strokeWidth: 1,
      }),
    ],
    scales: {
      x: {
        scale: scaleUtc,
        nice: true,
        axis: { ticks: { count: 5 } },
      },
      y: {
        scale: scaleLinear,
        nice: true,
        grid: true,
        axis: { label: "Volume (lbs)" },
      },
    },
    color: {
      domain: series,
      range: series.map((name, index) => seriesColor(name, index)),
    },
    focus: "group-x",
    theme: CHART_THEME,
    tooltip: {
      use: tooltip,
      formatGroup: summary,
    },
  });
}

/**
 * "Volume by movement" stacked area for the six-workout window ending at the
 * selected workout, plus its legend and the "Selected workout" marker.
 */
export function VolumeOverviewChart({ workouts, selectedWorkoutId }: VolumeOverviewChartProps): JSX.Element {
  const height = useChartHeight(220, 280);
  const { rows, series, selectedDate } = volumeOverviewSeries(workouts, selectedWorkoutId);

  if (rows.length === 0 || !selectedDate) {
    return <p className="text-sm text-muted-foreground">No volume to chart yet.</p>;
  }

  // A single date cannot read as a trend; say so instead of drawing one point.
  const distinctDates = new Set(rows.map((row) => row.date.getTime())).size;
  if (distinctDates < 2) {
    return <p className="text-sm text-muted-foreground">Not enough history for a trend yet.</p>;
  }

  const definition = overviewDefinition(rows, series);

  return (
    <div className="space-y-3">
      <Chart
        definition={definition}
        height={height}
        ariaLabel={`Volume by movement for ${formatWorkoutDate(selectedDate)}`}
        style={TOOLTIP_STYLE}
      />

      {/* The legend repeats the chart's color mapping, so color is never the only signal. */}
      <ul className="flex flex-wrap gap-x-4 gap-y-2">
        {series.map((name, index) => (
          <li key={name} className="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: seriesColor(name, index) }}
            />
            {name}
          </li>
        ))}
      </ul>

      <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-accent ring-1 ring-foreground/40" />
        Selected workout
      </p>
    </div>
  );
}

export type { VolumeOverviewChartProps };
