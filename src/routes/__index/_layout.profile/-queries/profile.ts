import { getWeightsServerFn } from "@/lib/weight.functions";
import { queryOptions } from "@tanstack/react-query";

export const bodyWeightsQueryOptions = () =>
  queryOptions({
    queryKey: ["body-weights"],
    queryFn: () => getWeightsServerFn(),
  });
