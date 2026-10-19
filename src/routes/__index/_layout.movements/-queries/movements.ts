import { getMovementsServerFn } from "@/lib/movements.functions";
import { queryOptions } from "@tanstack/react-query";

export const movementsQueryOptions = () =>
  queryOptions({
    queryKey: ["movements"],
    queryFn: () => getMovementsServerFn(),
  });
