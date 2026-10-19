import type { CSSProperties, JSX } from "react";
import { areaY, defineChart, dot, lineY, type ChartPoint } from "@tanstack/charts";
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

/** One point per set: x = weight, y = reps, with the shaded area under the line
 * giving the volume its visual weight. */
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

function setChartDefinition(rows: SetRow[]) {
  const maxReps = Math.max(...rows.map((row) => row.reps), 1);

  // An area/line needs one y per x. Multiple sets can share a weight (and even
  // the same weight × reps), so the envelope uses the best set at each weight
  // while every set still gets its own dot and tooltip.
  const areaRows: SetRow[] = Array.from(
    rows
      .reduce((byWeight, row) => {
        const current = byWeight.get(row.weight);
        if (!current || row.reps > current.reps) {
          byWeight.set(row.weight, row);
        }
        return byWeight;
      }, new Map<number, SetRow>())
      .values(),
  ).sort((a, b) => a.weight - b.weight);

  return defineChart({
    marks: [
      // The shaded area under the reps/weight envelope is the volume visual. The
      // exact per-set volume remains in the tooltip and the set list.
      areaY(areaRows, {
        x: "weight",
        y: "reps",
        fill: SERIES_COLOR,
        fillOpacity: 0.16,
      }),
      lineY(areaRows, {
        x: "weight",
        y: "reps",
        stroke: SERIES_COLOR,
        strokeWidth: 2,
      }),
      // Small points keep the eye on the set positions instead of oversized bubbles.
      dot(rows, {
        x: "weight",
        y: "reps",
        r: 4,
        fill: SERIES_COLOR,
        stroke: "var(--color-card)",
        strokeWidth: 2,
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
        scale: scaleLinear().domain([0, maxReps]),
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
 * Weight (x) vs reps (y) area chart for one movement's sets in the selected
 * workout. The shaded area supplies the volume visual; tooltips and the set
 * list carry the exact weight × reps volume.
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

  return (
    <Chart
      definition={setChartDefinition(rows)}
      height={height}
      ariaLabel={`${movementName} — weight vs reps (area = volume) on ${formatWorkoutDate(selectedDate)}`}
      style={TOOLTIP_STYLE}
    />
  );
}

export type { MovementSetChartProps };
