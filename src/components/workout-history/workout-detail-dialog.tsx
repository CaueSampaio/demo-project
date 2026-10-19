import { useEffect, useLayoutEffect, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatCard } from "@/components/stat-card";
import { formatNumber, formatWorkoutDateLong, formatWorkoutTime } from "@/lib/format";
import { summarizeMovements, summarizeWorkout, type WorkoutLike } from "@/lib/workout-analytics";

type WorkoutDetailDialogProps = {
  workout: WorkoutLike | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** SSR-safe layout effect (no focus work happens on the server). */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Ordinal label for a position index: "1st", "2nd", …, "11th"/"12th"/"13th". */
const ordinalLabel = (position: number) => {
  const mod100 = position % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${position}th`;
  const suffixes = ["th", "st", "nd", "rd"] as const;
  return `${position}${suffixes[position % 10] ?? "th"}`;
};

/**
 * URL-driven detail shell for a completed workout: an Overview tab plus one
 * alphabetical tab per movement. Task 10 replaces the summary/set lists with
 * charts; this task owns the shell, tabs, summary and set list.
 */
export function WorkoutDetailDialog({ workout, open, onOpenChange }: WorkoutDetailDialogProps) {
  // Radix restores focus to a `Dialog.Trigger` it owns; here the trigger lives
  // in the card, so remember whatever was focused when we opened and restore it
  // on close (Escape, Back, or the close button).
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  useIsomorphicLayoutEffect(() => {
    if (open && !wasOpenRef.current) {
      restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    wasOpenRef.current = open;
  }, [open]);

  if (!workout) return null;

  const completedAt = workout.completedAt ?? new Date();
  const dateText = formatWorkoutDateLong(completedAt);
  const timeText = formatWorkoutTime(completedAt);
  const summary = summarizeWorkout(workout);
  const movements = summarizeMovements(workout);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocusRef.current?.focus();
        }}>
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle>
                {dateText} · {timeText}
              </DialogTitle>
              <DialogDescription>
                {formatNumber(summary.setCount)} sets · {formatNumber(summary.movementCount)} movements ·{" "}
                {formatNumber(summary.totalVolume)} volume
              </DialogDescription>
            </div>
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Close dialog">
                <X className="h-5 w-5" aria-hidden="true" />
              </Button>
            </DialogClose>
          </div>
        </DialogHeader>

        <DialogBody>
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              {movements.map((movement) => (
                <TabsTrigger key={movement.movementId} value={movement.movementId}>
                  {movement.movementName}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="overview">
              {movements.length === 0 ? (
                <p className="text-sm text-muted-foreground">No movements in this workout.</p>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <StatCard label="Sets" value={formatNumber(summary.setCount)} />
                    <StatCard label="Movements" value={formatNumber(summary.movementCount)} />
                    <StatCard
                      label="Volume"
                      value={formatNumber(summary.totalVolume)}
                      unit="lbs"
                      className="col-span-2 sm:col-span-1"
                    />
                  </div>

                  <ul className="space-y-1">
                    {workout.sets.map((set, index) => (
                      <li key={set.id} className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">{set.movement.name}</span>{" "}
                        {ordinalLabel(index + 1)}: {formatNumber(set.weight)} lbs × {formatNumber(set.reps)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </TabsContent>

            {movements.map((movement) => (
              <TabsContent key={movement.movementId} value={movement.movementId}>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {movement.setCount} sets · {formatNumber(movement.totalReps)} reps ·{" "}
                    {formatNumber(movement.totalVolume)} volume
                  </p>
                  <ul className="space-y-1">
                    {movement.sets.map((set, index) => (
                      <li key={set.id} className="text-sm text-muted-foreground">
                        {ordinalLabel(index + 1)}: {formatNumber(set.weight)} lbs × {formatNumber(set.reps)}
                      </li>
                    ))}
                  </ul>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

export type { WorkoutDetailDialogProps };
