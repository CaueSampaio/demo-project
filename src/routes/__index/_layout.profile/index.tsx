import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSuspenseQuery } from "@tanstack/react-query";
import { bodyWeightsQueryOptions } from "./-queries/profile";

export const Route = createFileRoute("/__index/_layout/profile/")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(bodyWeightsQueryOptions());
  },
  component: ProfilePage,
});

function ProfilePage() {
  const { data: bodyWeights } = useSuspenseQuery(bodyWeightsQueryOptions());

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Profile</h1>

      <Card>
        <CardHeader>
          <CardTitle>Weight Tracking</CardTitle>
        </CardHeader>
        <CardContent>
          {bodyWeights.length === 0 && (
            <p className="text-sm text-slate-500">No weight entries yet. Add one above!</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
