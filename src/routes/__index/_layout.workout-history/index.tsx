import { createFileRoute } from "@tanstack/react-router";
import { History } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import { WorkoutCard } from "@/components/workout-history/workout-card";
import { WorkoutDetailDialog } from "@/components/workout-history/workout-detail-dialog";
import { deleteWorkoutsServerFn } from "@/lib/workouts.functions";
import { formatNumber } from "@/lib/format";
import { workoutHistoryQueryOptions } from "./-queries/workout-history";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/__index/_layout/workout-history/")({
  validateSearch: (search: Record<string, unknown>): { workout?: string } => ({
    workout: typeof search.workout === "string" && search.workout.length > 0 ? search.workout : undefined,
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(workoutHistoryQueryOptions());
  },
  component: WorkoutHistoryPage,
});

function WorkoutHistoryPage() {
  const queryClient = useQueryClient();
  const { data: workouts } = useSuspenseQuery(workoutHistoryQueryOptions());
  const { workout: openId } = Route.useSearch();
  const navigate = Route.useNavigate();

  const deleteWorkoutsMutation = useMutation({
    mutationFn: (workoutIds: string[]) => deleteWorkoutsServerFn({ data: { workoutIds } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workoutHistoryQueryOptions().queryKey });
    },
  });

  // No default selection: the dialog is driven purely by the `workout` search
  // param. An unknown (or just-deleted) id resolves to null and renders nothing.
  const openWorkout = openId ? (workouts.find((workout) => workout.id === openId) ?? null) : null;

  const handleOpen = (id: string) => {
    void navigate({ search: (prev) => ({ ...prev, workout: id }) });
  };

  const handleOpenChange = (open: boolean) => {
    if (open) return;
    void navigate({ search: (prev) => ({ ...prev, workout: undefined }), replace: true });
  };

  const totalVolume = workouts.reduce(
    (sum, workout) => sum + workout.sets.reduce((setSum, set) => setSum + set.weight * set.reps, 0),
    0,
  );
  const trainedMovements = new Set(workouts.flatMap((workout) => workout.sets.map((set) => set.movement.id))).size;

  return (
    <div className="space-y-6">
      <PageHeader title="Workout History" description="Review your completed sessions." />

      {workouts.length === 0 ? (
        <Card>
          <CardContent className="p-0 md:p-0">
            <EmptyState
              icon={History}
              title="No completed workouts yet."
              description="Finish a workout to see it here."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard label="Workouts" value={formatNumber(workouts.length)} />
            <StatCard label="Volume" value={formatNumber(totalVolume)} unit="lbs" />
            <StatCard label="Movements" value={formatNumber(trainedMovements)} className="col-span-2 sm:col-span-1" />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {workouts.map((workout) => (
              <WorkoutCard
                key={workout.id}
                workout={workout}
                onOpen={() => handleOpen(workout.id)}
                onDelete={() => deleteWorkoutsMutation.mutate([workout.id])}
                deleting={deleteWorkoutsMutation.isPending}
              />
            ))}
          </div>
        </>
      )}

      <WorkoutDetailDialog workout={openWorkout} open={openWorkout !== null} onOpenChange={handleOpenChange} />
    </div>
  );
}
