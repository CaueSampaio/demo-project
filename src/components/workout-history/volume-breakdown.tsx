import { formatNumber, formatWorkoutDate } from "@/lib/format";
import type { MovementSummary } from "@/lib/workout-analytics";

const BAR_COLORS = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"] as const;

/**
 * Session-volume breakdown for the selected workout: one horizontal bar per
 * movement, sorted by volume. This answers "what drove this session?" without
 * a date axis, which is a better fit for a single-workout overview.
 */
export function VolumeBreakdown({
  movements,
  selectedDate,
}: {
  movements: MovementSummary[];
  selectedDate: Date | string;
}) {
  const sorted = [...movements].sort((a, b) => b.totalVolume - a.totalVolume);
  const totalVolume = sorted.reduce((sum, movement) => sum + movement.totalVolume, 0);
  const maxVolume = Math.max(...sorted.map((movement) => movement.totalVolume), 1);

  return (
    <section
      aria-label={`Volume by movement for ${formatWorkoutDate(selectedDate)}`}
      data-testid="volume-breakdown"
      className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-base font-bold text-foreground">Volume by movement</h3>
        <p className="text-xs text-muted-foreground">Share of this session</p>
      </div>

      <ul className="space-y-4">
        {sorted.map((movement, index) => {
          const percent = totalVolume > 0 ? Math.round((movement.totalVolume / totalVolume) * 100) : 0;
          const width = Math.max((movement.totalVolume / maxVolume) * 100, 2);

          return (
            <li key={movement.movementId}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-medium text-foreground">{movement.movementName}</span>
                <span className="shrink-0 text-sm tabular-nums text-foreground">
                  {formatNumber(movement.totalVolume)} lbs
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={`${movement.movementName} volume`}
                aria-valuemin={0}
                aria-valuemax={maxVolume}
                aria-valuenow={movement.totalVolume}
                className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-muted"
                title={`${formatNumber(movement.totalVolume)} lbs`}>
                <div
                  aria-hidden="true"
                  className={`h-full rounded-full ${BAR_COLORS[index % BAR_COLORS.length]}`}
                  style={{ width: `${width}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatNumber(movement.setCount)} sets · {percent}% of session volume
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
