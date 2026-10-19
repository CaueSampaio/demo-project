import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatNumber } from "@/lib/format";
import type { MovementSummary } from "@/lib/workout-analytics";

type MovementChipsProps = {
  movements: MovementSummary[];
  maxVisible?: number;
};

/**
 * Compact movement summary for a workout card: up to `maxVisible` chips, plus a
 * `+N more` disclosure that lists every movement (with set count and volume) in
 * a popover. Each chip also exposes the same data as a tooltip hint on hover;
 * the popover is the touch-accessible source of truth.
 */
export function MovementChips({ movements, maxVisible = 3 }: MovementChipsProps) {
  if (movements.length === 0) return null;

  const visible = movements.slice(0, maxVisible);
  const overflowCount = movements.length - visible.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map((movement) => (
        <Tooltip key={movement.movementId}>
          <TooltipTrigger asChild>
            <span className="inline-flex max-w-full items-center rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <span className="break-words">{movement.movementName}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {movement.setCount} sets · {formatNumber(movement.totalVolume)} volume
          </TooltipContent>
        </Tooltip>
      ))}

      {overflowCount > 0 ? (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="px-2 text-xs text-muted-foreground"
              aria-label={`Show all ${movements.length} movements`}>
              +{overflowCount} more
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start">
            <ul className="space-y-2">
              {movements.map((movement) => (
                <li key={movement.movementId} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 break-words font-medium text-foreground">{movement.movementName}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {movement.setCount} sets · {formatNumber(movement.totalVolume)}
                  </span>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}

export type { MovementChipsProps };
