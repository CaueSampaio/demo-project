import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { bodyWeightsQueryOptions } from "./-queries/profile";
import { addBodyWeightServerFn, deleteWeightServerFn } from "@/lib/weight.server";
import { WeightInput, isValidWeight } from "@/components/weight-input";
import { WeightChart } from "./weight-chart";

export const Route = createFileRoute("/__index/_layout/profile/")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(bodyWeightsQueryOptions());
  },
  component: ProfilePage,
});

const recordedAtFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function ProfilePage() {
  const queryClient = useQueryClient();
  const { data: bodyWeights } = useSuspenseQuery(bodyWeightsQueryOptions());
  const [weight, setWeight] = useState("");

  const addBodyWeightMutation = useMutation({
    mutationFn: (data: { weightLbs: number }) => addBodyWeightServerFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bodyWeightsQueryOptions().queryKey });
      setWeight("");
    },
  });

  const deleteWeightMutation = useMutation({
    mutationFn: (id: string) => deleteWeightServerFn({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bodyWeightsQueryOptions().queryKey });
    },
  });

  const handleAddWeight = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidWeight(weight, 1, 1500)) return;
    addBodyWeightMutation.mutate({ weightLbs: parseInt(weight) });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Profile</h1>

      <Card>
        <CardHeader>
          <CardTitle>Weight Tracking</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleAddWeight} className="flex gap-2 items-center">
            <WeightInput value={weight} onChange={setWeight} className="w-44" />
            <Button type="submit" disabled={!isValidWeight(weight, 1, 1500) || addBodyWeightMutation.isPending}>
              {addBodyWeightMutation.isPending ? "Adding..." : "Add"}
            </Button>
          </form>

          {bodyWeights.length > 0 && <WeightChart records={bodyWeights} />}

          {bodyWeights.length === 0 ? (
            <p className="text-sm text-slate-500">No weight entries yet. Add one above!</p>
          ) : (
            <ul className="space-y-2">
              {bodyWeights.map((record) => (
                <li
                  key={record.id}
                  data-testid="weight-entry"
                  data-recorded-at={new Date(record.recordedAt).toISOString()}
                  className="px-3 py-2 bg-slate-50 rounded-lg text-sm flex items-center justify-between"
                >
                  <span>
                    {record.weightLbs} lbs — {recordedAtFormatter.format(new Date(record.recordedAt))}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-slate-400"
                    onClick={() => deleteWeightMutation.mutate(record.id)}
                  >
                    Delete
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
