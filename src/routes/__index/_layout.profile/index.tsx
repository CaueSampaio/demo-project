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
          {bodyWeights.length === 0 ? (
            <p className="text-sm text-slate-500">No weight entries yet. Add one above!</p>
          ) : (
            <ul className="space-y-2">
              {bodyWeights.map((record) => (
                <li key={record.id} className="px-3 py-2 bg-slate-50 rounded-lg text-sm font-medium text-slate-700">
                  {record.weightLbs} lbs
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
