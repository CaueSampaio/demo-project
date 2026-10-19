import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ChevronRight, Dumbbell, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { createMovementServerFn } from "@/lib/movements.functions";
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
  const [search, setSearch] = useState("");
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

  const query = search.trim().toLowerCase();
  const filteredMovements = query
    ? movements.filter((movement) => movement.name.toLowerCase().includes(query))
    : movements;

  return (
    <div className="space-y-6">
      <PageHeader title="Movements" description="Manage your exercise library and review progress." />

      <Card>
        <CardHeader>
          <CardTitle>Add New Movement</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit}
            className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
            <Field label="Movement name">
              <Input
                placeholder="Movement name (e.g. Bench Press)"
                value={name}
                ref={nameRef}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <label
              htmlFor="movement-bodyweight"
              className="flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-control px-2 text-sm font-medium text-foreground md:min-h-10">
              <Checkbox
                id="movement-bodyweight"
                ref={checkboxRef}
                checked={isBodyweight}
                onChange={(e) => setIsBodyweight(e.target.checked)}
              />
              Body-weight
            </label>
            <Button
              type="submit"
              disabled={!name.trim()}
              aria-busy={createMovementMutation.isPending}
              className="w-full md:w-auto">
              {createMovementMutation.isPending ? "Adding..." : "Add"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-baseline justify-between gap-3 space-y-0">
          <CardTitle>All Movements</CardTitle>
          <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
            {filteredMovements.length} of {movements.length} movements
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Search movements">
            <Input
              type="search"
              placeholder="Search by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>

          {movements.length === 0 ? (
            <EmptyState
              icon={Dumbbell}
              title="No movements yet"
              description="Add your first movement above to start tracking progress."
            />
          ) : filteredMovements.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No matching movements"
              description={`Nothing matches “${search.trim()}”. Try a different search.`}
              action={
                <Button variant="outline" size="lg" onClick={() => setSearch("")}>
                  Clear search
                </Button>
              }
            />
          ) : (
            <ul className="space-y-2">
              {filteredMovements.map((movement) => (
                <li
                  key={movement.id}
                  className="flex min-h-11 items-center gap-3 rounded-control border border-border bg-card px-3 transition-colors hover:bg-muted/60">
                  <Link
                    to="/movements/$movementId"
                    params={{ movementId: movement.id }}
                    className="flex min-h-11 min-w-0 flex-1 items-center text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                    <span className="truncate">{movement.name}</span>
                  </Link>
                  {movement.isBodyweight ? <Badge variant="brand">Bodyweight</Badge> : null}
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
