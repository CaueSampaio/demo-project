import { useEffect, useLayoutEffect, useRef } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { MovementSetChart } from "./movement-set-chart";
import { VolumeBreakdown } from "./volume-breakdown";

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
 * URL-driven detail for a completed workout: a sticky header + tab strip over a
 * scrollable body. The Overview tab breaks the session volume down by movement;
 * each movement tab pairs summary stats with a weight × reps chart and the
 * performed set list.
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
            {/* Sticky so the tab strip stays reachable while the body scrolls. */}
            <TabsList className="sticky top-0 z-10 bg-card">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              {movements.map((movement) => (
                <TabsTrigger key={movement.movementId} value={movement.movementId}>
                  {movement.movementName}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="overview">
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <StatCard label="Volume" value={formatNumber(summary.totalVolume)} unit="lbs" />
                  <StatCard label="Sets" value={formatNumber(summary.setCount)} />
                  <StatCard
                    label="Movements"
                    value={formatNumber(summary.movementCount)}
                    className="col-span-2 sm:col-span-1"
                  />
                </div>

                {movements.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No movements in this workout.</p>
                ) : (
                  <VolumeBreakdown movements={movements} selectedDate={completedAt} />
                )}
              </div>
            </TabsContent>

            {movements.map((movement) => (
              <TabsContent key={movement.movementId} value={movement.movementId}>
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-foreground">{movement.movementName}</h3>
                    {movement.isBodyweight ? <Badge variant="brand">Bodyweight</Badge> : null}
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatCard label="Max Weight" value={formatNumber(movement.maxWeight)} unit="lbs" />
                    <StatCard label="Total Reps" value={formatNumber(movement.totalReps)} />
                    <StatCard label="Total Volume" value={formatNumber(movement.totalVolume)} unit="lbs" />
                    <StatCard label="Sets" value={formatNumber(movement.setCount)} />
                  </div>

                  <MovementSetChart
                    movementName={movement.movementName}
                    sets={movement.sets}
                    selectedDate={completedAt}
                  />

                  <ol className="space-y-2">
                    {movement.sets.map((set, index) => (
                      <li
                        key={set.id}
                        className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
                        <span className="font-medium text-foreground">
                          {ordinalLabel(index + 1)}: {formatNumber(set.weight)} lbs × {formatNumber(set.reps)} reps
                        </span>
                        <span className="text-muted-foreground">
                          {formatNumber(set.weight * set.reps)} volume
                          {set.createdAt ? ` · ${formatWorkoutTime(set.createdAt)}` : ""}
                        </span>
                      </li>
                    ))}
                  </ol>
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
