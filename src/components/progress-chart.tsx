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

// Points serialize to ISO strings crossing the server-fn boundary; the chart
// wants Date instances for the UTC time scale.
const toChartRows = (points: { date: Date | string; value: number }[]) =>
  points.map((point) => ({
    date: new Date(point.date),
    value: point.value,
  }));

const progressChartDefinition = (points: { date: Date | string; value: number }[], yLabel: string) => {
  const rows = toChartRows(points);

  return defineChart({
    marks: [
      // The line mark renders nothing for a single point; the dot covers it.
      lineY(rows, { x: "date", y: "value" }),
      dot(rows, { x: "date", y: "value" }),
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
        axis: { label: yLabel },
      },
    },
    theme: CHART_THEME,
    tooltip,
  });
};

export function MetricChart({
  points,
  yLabel,
  ariaLabel,
}: {
  points: { date: Date | string; value: number }[];
  yLabel: string;
  ariaLabel: string;
}): JSX.Element {
  return (
    <Chart
      definition={progressChartDefinition(points, yLabel)}
      height={320}
      ariaLabel={ariaLabel}
      style={TOOLTIP_STYLE}
    />
  );
}
