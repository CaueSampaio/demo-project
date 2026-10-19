import type { CSSProperties, JSX } from "react";
import { defineChart, dot, lineY, type ChartPoint } from "@tanstack/charts";
import { scaleSqrt } from "d3-scale";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/charts/react";
import { formatNumber, formatWorkoutDate } from "@/lib/format";
import type { WorkoutSetLike } from "@/lib/workout-analytics";
import { useChartHeight } from "./use-chart-height";

type MovementSetChartProps = {
  movementName: string;
  sets: WorkoutSetLike[];
  selectedDate: Date | string;
};

/** One bubble per set: x = weight, y = reps, bubble area = volume (weight × reps). */
type SetRow = {
  ordinal: number;
  reps: number;
  weight: number;
  volume: number;
  label: string;
};

// Paper & Ink chart theme: brand-blue series on a warm grid, over the paper card.
const CHART_THEME = {
  foreground: "var(--color-foreground)",
  muted: "var(--color-muted-foreground)",
  grid: "var(--color-border)",
  background: "var(--color-card)",
  palette: ["var(--color-chart-1)"],
};

const SERIES_COLOR = "var(--color-chart-1)";

// The tooltip element is appended inside the chart host, so declaring these on
// the host inherits them into the tooltip the library paints.
const TOOLTIP_STYLE = {
  "--ts-chart-tooltip-background": "var(--color-card)",
  "--ts-chart-tooltip-color": "var(--color-foreground)",
  "--ts-chart-tooltip-border": "1px solid var(--color-border)",
  "--ts-chart-tooltip-border-radius": "var(--radius-control)",
  "--ts-chart-tooltip-shadow": "var(--shadow-sm)",
} as CSSProperties;

function setChartDefinition(rows: SetRow[], maxVolume: number) {
  return defineChart({
    marks: [
      // The line connects performed order; the bubbles carry weight, reps and volume.
      lineY(rows, { x: "weight", y: "reps", stroke: SERIES_COLOR, strokeWidth: 2 }),
      dot(rows, {
        x: "weight",
        y: "reps",
        r: "volume",
        rScale: scaleSqrt().domain([0, maxVolume]).range([0, 22]),
        fill: SERIES_COLOR,
        fillOpacity: 0.75,
        stroke: SERIES_COLOR,
        strokeWidth: 1.5,
      }),
    ],
    scales: {
      x: {
        scale: scaleLinear,
        nice: true,
        grid: true,
        axis: { label: "Weight (lbs)" },
      },
      y: {
        scale: scaleLinear,
        nice: true,
        axis: { label: "Reps" },
      },
    },
    theme: CHART_THEME,
    tooltip: {
      use: tooltip,
      format: (point: ChartPoint<SetRow, number, number>) =>
        [
          point.datum.label,
          `${formatNumber(point.datum.weight)} lbs × ${formatNumber(point.datum.reps)}`,
          `${formatNumber(point.datum.volume)} volume`,
        ].join("\n"),
    },
  });
}

/**
 * Weight (x) vs reps (y) scatter for one movement's sets in the selected
 * workout, with a sqrt-scaled bubble radius per set volume.
 */
export function MovementSetChart({ movementName, sets, selectedDate }: MovementSetChartProps): JSX.Element {
  const height = useChartHeight(220, 300);

  if (sets.length === 0) {
    return <p className="text-sm text-muted-foreground">No sets for this movement.</p>;
  }

  const rows: SetRow[] = sets.map((set, index) => ({
    ordinal: index + 1,
    reps: set.reps,
    weight: set.weight,
    volume: set.weight * set.reps,
    label: `Set ${index + 1}`,
  }));

  // Guard the degenerate all-zero-volume case so the sqrt scale stays finite.
  const maxVolume = rows.reduce((max, row) => Math.max(max, row.volume), 0) || 1;

  return (
    <Chart
      definition={setChartDefinition(rows, maxVolume)}
      height={height}
      ariaLabel={`${movementName} — weight vs reps (area = volume) on ${formatWorkoutDate(selectedDate)}`}
      style={TOOLTIP_STYLE}
    />
  );
}

export type { MovementSetChartProps };
