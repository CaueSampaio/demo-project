import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatNumber, formatWorkoutDate, formatWorkoutTime } from "@/lib/format";
import { summarizeMovements, summarizeWorkout, type WorkoutLike } from "@/lib/workout-analytics";
import { MovementChips } from "./movement-chips";

type WorkoutCardProps = {
  workout: WorkoutLike;
  onOpen: () => void;
  onDelete: () => void;
  deleting?: boolean;
};

/**
 * One completed workout in the history grid. The card itself is not clickable;
 * "Check Details" opens the URL-driven detail dialog and "Delete" removes the
 * workout immediately.
 */
export function WorkoutCard({ workout, onOpen, onDelete, deleting = false }: WorkoutCardProps) {
  const completedAt = workout.completedAt ?? new Date();
  const dateText = formatWorkoutDate(completedAt);
  const timeText = formatWorkoutTime(completedAt);
  const summary = summarizeWorkout(workout);
  const movements = summarizeMovements(workout);

  return (
    <Card className="flex flex-col">
      <CardHeader className="gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-base font-bold text-card-foreground">{dateText}</h2>
          <span className="shrink-0 text-sm text-muted-foreground">{timeText}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {formatNumber(summary.setCount)} sets · {formatNumber(summary.movementCount)} movements ·{" "}
          {formatNumber(summary.totalVolume)} volume
        </p>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4">
        <MovementChips movements={movements} />

        <div className="mt-auto flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={onOpen}
            aria-label={`Check details for workout ${dateText} at ${timeText}`}>
            Check Details
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onDelete}
            disabled={deleting}
            aria-busy={deleting}
            aria-label={`Delete workout ${dateText} at ${timeText}`}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export type { WorkoutCardProps };
