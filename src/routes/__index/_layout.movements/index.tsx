import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createMovementServerFn } from "@/lib/movements.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { movementsQueryOptions } from "./-queries/movements";

export const Route = createFileRoute("/__index/_layout/movements/")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(movementsQueryOptions());
  },
  component: MovementsPage,
});

function MovementsPage() {
  const queryClient = useQueryClient();
  const { data: movements } = useSuspenseQuery(movementsQueryOptions());
  const [name, setName] = useState("");
  const [isBodyweight, setIsBodyweight] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const checkboxRef = useRef<HTMLInputElement>(null);

  // SSR hydration race guard (same pattern as WeightInput): `input` and
  // `change` events dispatched before hydration are dropped by React while
  // the DOM keeps the typed/checked state. After hydration, adopt whatever
  // the DOM holds into our controlled state so early interactions are not lost.
  useEffect(() => {
    const nameEl = nameRef.current;
    if (nameEl && nameEl.value !== name) setName(nameEl.value);
    const checkboxEl = checkboxRef.current;
    if (checkboxEl && checkboxEl.checked !== isBodyweight) setIsBodyweight(checkboxEl.checked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createMovementMutation = useMutation({
    mutationFn: (data: { name: string; isBodyweight: boolean }) =>
      createMovementServerFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: movementsQueryOptions().queryKey });
      setName("");
      setIsBodyweight(false);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createMovementMutation.mutate({ name: name.trim(), isBodyweight });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Movements</h1>

      <Card>
        <CardHeader>
          <CardTitle>Add New Movement</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex gap-3">
            <Input
              placeholder="Movement name (e.g. Bench Press)"
              value={name}
              ref={nameRef}
              onChange={(e) => setName(e.target.value)}
              className="flex-1"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                ref={checkboxRef}
                type="checkbox"
                checked={isBodyweight}
                onChange={(e) => setIsBodyweight(e.target.checked)}
                className="rounded border-gray-300"
              />
              Body-weight
            </label>
            <Button type="submit" disabled={!name.trim()}>
              {createMovementMutation.isPending ? "Adding..." : "Add"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>All Movements</CardTitle>
        </CardHeader>
        <CardContent>
          {movements.length === 0 ? (
            <p className="text-sm text-slate-500">No movements yet. Add one above!</p>
          ) : (
            <ul className="space-y-2">
              {movements.map((movement) => (
                <li key={movement.id} className="px-3 py-2 bg-slate-50 rounded-lg text-sm font-medium text-slate-700">
                  <Link to="/movements/$movementId" params={{ movementId: movement.id }}>
                    {movement.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
