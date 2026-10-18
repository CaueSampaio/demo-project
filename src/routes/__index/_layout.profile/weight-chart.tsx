import type { JSX } from "react";
import { dot, defineChart, lineY } from "@tanstack/charts";
import { scaleUtc } from "d3-scale";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/charts/react";

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
    tooltip,
  });
};

export function WeightChart({
  records,
}: {
  records: { recordedAt: Date | string; weightLbs: number }[];
}): JSX.Element {
  return <Chart definition={weightChartDefinition(records)} height={320} ariaLabel="Weight over time" />;
}
