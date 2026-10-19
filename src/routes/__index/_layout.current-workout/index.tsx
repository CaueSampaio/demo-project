import { useState, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { WeightInput } from "@/components/weight-input";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import {
  createWorkoutServerFn,
  completeWorkoutServerFn,
  addSetServerFn,
  deleteSetServerFn,
} from "@/lib/workouts.functions";
import { Play, Check, Plus, X, Dumbbell } from "lucide-react";
import { useSuspenseQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { formatNumber } from "@/lib/format";
import { summarizeMovements, summarizeWorkout } from "@/lib/workout-analytics";
import {
  currentWorkoutQueryOptions,
  latestBodyWeightQueryOptions,
  movementsQueryOptions,
} from "./-queries/current-workout";

export const Route = createFileRoute("/__index/_layout/current-workout/")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(currentWorkoutQueryOptions()),
      context.queryClient.ensureQueryData(movementsQueryOptions()),
    ]);
  },
  component: CurrentWorkoutPage,
});

const todayLong = () =>
  new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

function CurrentWorkoutPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: workout } = useSuspenseQuery(currentWorkoutQueryOptions());
  const { data: movements } = useSuspenseQuery(movementsQueryOptions());
  const [selectedMovement, setSelectedMovement] = useState("");
  const [reps, setReps] = useState("");
  const [weight, setWeight] = useState("");

  const isBodyweightSelected = movements.find((m) => m.id === selectedMovement)?.isBodyweight ?? false;

  const { data: latestWeight } = useQuery({
    ...latestBodyWeightQueryOptions(),
    enabled: isBodyweightSelected,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (isBodyweightSelected && latestWeight?.weightLbs != null) {
      setWeight(String(latestWeight.weightLbs));
    }
  }, [isBodyweightSelected, latestWeight]);

  const createWorkoutMutation = useMutation({
    mutationFn: () => createWorkoutServerFn(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: currentWorkoutQueryOptions().queryKey });
      toast.success("Workout started");
    },
  });

  const completeWorkoutMutation = useMutation({
    mutationFn: () => completeWorkoutServerFn(),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: currentWorkoutQueryOptions().queryKey });
      await queryClient.invalidateQueries({ queryKey: ["workout-history"] });
      toast.success("Workout completed");
      if (result.success && "workoutId" in result && result.workoutId) {
        navigate({ to: "/workout-history", search: { workout: result.workoutId } });
      }
    },
  });

  const addSetMutation = useMutation({
    mutationFn: (data: { movementId: string; reps: number; weight: number }) => addSetServerFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: currentWorkoutQueryOptions().queryKey });
      setReps("");
      toast.success("Set added");
    },
  });

  const deleteSetMutation = useMutation({
    mutationFn: (setId: string) => deleteSetServerFn({ data: { setId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: currentWorkoutQueryOptions().queryKey });
      toast.success("Set deleted");
    },
  });

  const handleAddSet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMovement || !reps || !weight) return;
    addSetMutation.mutate({
      movementId: selectedMovement,
      reps: parseInt(reps),
      weight: parseInt(weight),
    });
  };

  if (!workout) {
    return (
      <div className="space-y-6">
        <PageHeader title="Current Workout" description="Log your working sets as you train." />
        <Card>
          <CardContent className="p-0 md:p-0">
            <EmptyState
              icon={Dumbbell}
              title="No active workout. Ready to start?"
              description="Start a session to begin logging sets."
              action={
                <Button
                  onClick={() => createWorkoutMutation.mutate()}
                  size="lg"
                  aria-busy={createWorkoutMutation.isPending}>
                  <Play className="h-4 w-4" aria-hidden="true" />
                  {createWorkoutMutation.isPending ? "Starting..." : "Start Workout"}
                </Button>
              }
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const summary = summarizeWorkout(workout);
  const movementGroups = summarizeMovements(workout);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Current Workout"
        description="Log your working sets as you train."
        actions={
          <Button
            variant="outline"
            onClick={() => completeWorkoutMutation.mutate()}
            aria-busy={completeWorkoutMutation.isPending}>
            <Check className="h-4 w-4" aria-hidden="true" />
            {completeWorkoutMutation.isPending ? "Completing..." : "Complete Workout"}
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <h2 className="text-xl font-bold tracking-tight text-card-foreground md:text-2xl">{todayLong()}</h2>
        </CardHeader>
        <CardContent className="space-y-6">
          <div data-testid="workout-summary" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard label="Sets" value={formatNumber(summary.setCount)} />
            <StatCard label="Movements" value={formatNumber(summary.movementCount)} />
            <StatCard
              label="Volume"
              value={formatNumber(summary.totalVolume)}
              unit="lbs"
              className="col-span-2 sm:col-span-1"
            />
          </div>

          <Separator />

          <form
            onSubmit={handleAddSet}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.75fr)_minmax(0,0.75fr)_auto] lg:items-end">
            <div className="space-y-2">
              <label htmlFor="set-movement" className="block text-sm font-medium text-foreground">
                Movement
              </label>
              <Select
                id="set-movement"
                value={selectedMovement}
                onChange={(e) => setSelectedMovement(e.target.value)}
                aria-label="Movement">
                <option value="">Select movement</option>
                {movements.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="set-weight" className="block text-sm font-medium text-foreground">
                Weight
              </label>
              <WeightInput id="set-weight" value={weight} onChange={setWeight} min={0} max={1500} />
            </div>

            <div className="space-y-2">
              <label htmlFor="set-reps" className="block text-sm font-medium text-foreground">
                Reps
              </label>
              <Input
                id="set-reps"
                type="number"
                placeholder="Reps"
                value={reps}
                onChange={(e) => setReps(e.target.value)}
                min={1}
              />
            </div>

            <Button
              type="submit"
              disabled={!selectedMovement || !reps || !weight}
              aria-busy={addSetMutation.isPending}
              className="w-full sm:col-span-2 sm:w-auto sm:justify-self-start lg:col-span-1 lg:justify-self-end">
              <Plus className="h-4 w-4" aria-hidden="true" />
              {addSetMutation.isPending ? "Adding..." : "Add"}
            </Button>
          </form>

          {workout.sets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sets yet. Add exercises to your workout!</p>
          ) : (
            <div className="space-y-6">
              {movementGroups.map((group) => (
                <section key={group.movementId} className="space-y-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <h3 className="text-base font-semibold text-foreground">{group.movementName}</h3>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatNumber(group.setCount)} {group.setCount === 1 ? "set" : "sets"} ·{" "}
                      {formatNumber(group.totalVolume)} lbs volume
                    </p>
                  </div>
                  <ul className="space-y-2">
                    {group.sets.map((set) => (
                      <li
                        key={set.id}
                        className="flex min-h-11 items-center justify-between gap-3 rounded-control border border-border bg-muted/50 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <span className="sr-only">{set.movement.name}</span>
                          <span className="font-medium text-foreground">
                            {set.reps} reps × {set.weight} lbs
                          </span>
                          <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                            {formatNumber(set.reps * set.weight)} lbs volume
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete set ${set.reps} reps × ${set.weight} lbs`}
                          disabled={deleteSetMutation.isPending}
                          onClick={() => deleteSetMutation.mutate(set.id)}
                          className="shrink-0 text-muted-foreground">
                          <X className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
