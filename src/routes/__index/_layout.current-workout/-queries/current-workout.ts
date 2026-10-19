import { getCurrentWorkoutServerFn } from "@/lib/workouts.functions";
import { getMovementsServerFn } from "@/lib/movements.functions";
import { getLatestBodyWeightServerFn } from "@/lib/weight.functions";
import { queryOptions } from "@tanstack/react-query";

export const currentWorkoutQueryOptions = () =>
  queryOptions({
    queryKey: ["current-workout"],
    queryFn: () => getCurrentWorkoutServerFn(),
  });

export const movementsQueryOptions = () =>
  queryOptions({
    queryKey: ["movements"],
    queryFn: () => getMovementsServerFn(),
  });

export const latestBodyWeightQueryOptions = () =>
  queryOptions({
    queryKey: ["latest-body-weight"],
    queryFn: () => getLatestBodyWeightServerFn(),
  });
