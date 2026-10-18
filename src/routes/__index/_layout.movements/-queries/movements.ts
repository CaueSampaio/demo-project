import { getMovementsServerFn, getMovementProgressServerFn } from "@/lib/movements.functions";
import { queryOptions } from "@tanstack/react-query";

export const movementsQueryOptions = () =>
  queryOptions({
    queryKey: ["movements"],
    queryFn: () => getMovementsServerFn(),
  });

export const movementProgressQueryOptions = (movementId: string) =>
  queryOptions({
    queryKey: ["movement-progress", movementId],
    queryFn: () => getMovementProgressServerFn({ data: { movementId } }),
  });
