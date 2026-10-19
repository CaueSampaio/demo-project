import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LogOut, Scale, Trash2 } from "lucide-react";
import { toast } from "react-toastify";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { WeightInput, isValidWeight } from "@/components/weight-input";
import { formatNumber, formatWeightEntry, formatWorkoutDate } from "@/lib/format";
import { bodyWeightsQueryOptions } from "./-queries/profile";
import { addBodyWeightServerFn, deleteWeightServerFn } from "@/lib/weight.functions";
import { WeightChart } from "./weight-chart";

export const Route = createFileRoute("/__index/_layout/profile/")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(bodyWeightsQueryOptions());
  },
  component: ProfilePage,
});

/** Up to two initials derived from the display name (falls back to email). */
function initialsFor(name: string | null, email: string): string {
  const source = name?.trim() || email;
  return source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function ProfilePage() {
  const { user } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const { data: bodyWeights } = useSuspenseQuery(bodyWeightsQueryOptions());
  const [weight, setWeight] = useState("");

  const addBodyWeightMutation = useMutation({
    mutationFn: (data: { weightLbs: number }) => addBodyWeightServerFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bodyWeightsQueryOptions().queryKey });
      setWeight("");
      toast.success("Weight added");
    },
  });

  const deleteWeightMutation = useMutation({
    mutationFn: (id: string) => deleteWeightServerFn({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bodyWeightsQueryOptions().queryKey });
      toast.success("Weight deleted");
    },
  });

  const handleAddWeight = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidWeight(weight, 1, 1500)) return;
    addBodyWeightMutation.mutate({ weightLbs: parseInt(weight) });
  };

  const firstWeight = bodyWeights[0];
  const latestWeight = bodyWeights[bodyWeights.length - 1];
  const weightChange = latestWeight ? latestWeight.weightLbs - firstWeight.weightLbs : 0;
  const changeLabel = weightChange > 0 ? `+${weightChange}` : String(weightChange);

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" description="Your account and weight history." />

      <Card data-testid="account-card">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between md:p-6">
          <div className="flex min-w-0 items-center gap-3">
            <div
              aria-hidden="true"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              {initialsFor(user.name, user.email)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-foreground">{user.name || user.email}</p>
              {user.name ? <p className="truncate text-sm text-muted-foreground">{user.email}</p> : null}
            </div>
          </div>
          <a
            href="/logout"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:self-auto">
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Log out
          </a>
        </CardContent>
      </Card>

      {bodyWeights.length > 0 ? (
        <section
          aria-label="Weight summary"
          data-testid="weight-summary"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard
            label="Latest"
            value={formatNumber(latestWeight.weightLbs)}
            unit="lbs"
            hint={formatWorkoutDate(latestWeight.recordedAt)}
          />
          <StatCard label="Change" value={changeLabel} unit="lbs" hint="Since first entry" />
          <StatCard
            label="Entries"
            value={formatNumber(bodyWeights.length)}
            hint={bodyWeights.length === 1 ? "weigh-in" : "weigh-ins"}
            className="col-span-2 sm:col-span-1"
          />
        </section>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Add Weight</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddWeight} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="space-y-2 sm:w-48">
              <label htmlFor="profile-weight" className="block text-sm font-medium text-foreground">
                Weight
              </label>
              <WeightInput id="profile-weight" value={weight} onChange={setWeight} />
            </div>
            <Button
              type="submit"
              disabled={!isValidWeight(weight, 1, 1500) || addBodyWeightMutation.isPending}
              aria-busy={addBodyWeightMutation.isPending}
              className="w-full sm:w-auto">
              {addBodyWeightMutation.isPending ? "Adding..." : "Add"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Weight Tracking</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {bodyWeights.length === 0 ? (
            <EmptyState
              icon={Scale}
              title="No weight entries yet. Add one above!"
              description="Your trend and history will appear here once you log a weight."
            />
          ) : (
            <>
              <WeightChart records={bodyWeights} />

              <Separator />

              <ul className="space-y-2">
                {bodyWeights.map((record) => (
                  <li
                    key={record.id}
                    data-testid="weight-entry"
                    data-recorded-at={new Date(record.recordedAt).toISOString()}
                    className="flex min-h-11 items-center justify-between gap-3 rounded-control border border-border bg-muted/50 px-3 py-2 text-sm">
                    <span className="min-w-0 text-foreground">{formatWeightEntry(record)}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${formatWeightEntry(record)}`}
                      disabled={deleteWeightMutation.isPending}
                      onClick={() => deleteWeightMutation.mutate(record.id)}
                      className="shrink-0 text-muted-foreground">
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
