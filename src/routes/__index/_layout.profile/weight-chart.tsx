import type { CSSProperties, JSX } from "react";
import { dot, defineChart, lineY } from "@tanstack/charts";
import { scaleUtc } from "d3-scale";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/charts/react";

// Paper & Ink chart theme: brand-blue series on a warm grid, drawn over the
// paper card. Values resolve through the design tokens, not literals.
const CHART_THEME = {
  foreground: "var(--color-foreground)",
  muted: "var(--color-muted-foreground)",
  grid: "var(--color-border)",
  background: "var(--color-card)",
  palette: ["var(--color-chart-1)"],
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

// Rows serialize to ISO strings crossing the server-fn boundary; the chart
// wants Date instances for the UTC time scale.
const toChartRows = (records: { recordedAt: Date | string; weightLbs: number }[]) =>
  records.map((record) => ({
    date: new Date(record.recordedAt),
    lbs: record.weightLbs,
  }));

const weightChartDefinition = (records: { recordedAt: Date | string; weightLbs: number }[]) => {
  const rows = toChartRows(records);

  return defineChart({
    marks: [
      // The line mark renders nothing for a single point; the dot covers it.
      lineY(rows, { x: "date", y: "lbs" }),
      dot(rows, { x: "date", y: "lbs" }),
    ],
    scales: {
      x: {
        scale: scaleUtc,
        nice: true,
        axis: { ticks: { count: 6 } },
      },
      y: {
        scale: scaleLinear,
        nice: true,
        grid: true,
        axis: { label: "Weight (lbs)" },
      },
    },
    theme: CHART_THEME,
    tooltip,
  });
};

export function WeightChart({ records }: { records: { recordedAt: Date | string; weightLbs: number }[] }): JSX.Element {
  return (
    <Chart
      definition={weightChartDefinition(records)}
      height={320}
      ariaLabel="Weight over time"
      style={TOOLTIP_STYLE}
    />
  );
}
