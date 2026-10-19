export type WorkoutSetLike = {
  id: string;
  reps: number;
  weight: number;
  createdAt: Date | string;
  movement: { id: string; name: string; isBodyweight: boolean };
};

export type WorkoutLike = {
  id: string;
  completedAt: Date | string | null;
  sets: WorkoutSetLike[];
};

export type WorkoutSummary = { setCount: number; movementCount: number; totalVolume: number };

export type MovementSummary = {
  movementId: string;
  movementName: string;
  isBodyweight: boolean;
  sets: WorkoutSetLike[];
  setCount: number;
  totalReps: number;
  maxWeight: number;
  totalVolume: number;
};

function setVolume(set: WorkoutSetLike): number {
  return set.weight * set.reps;
}

export function summarizeWorkout(workout: WorkoutLike): WorkoutSummary {
  const movementIds = new Set(workout.sets.map((set) => set.movement.id));

  return {
    setCount: workout.sets.length,
    movementCount: movementIds.size,
    totalVolume: workout.sets.reduce((sum, set) => sum + setVolume(set), 0),
  };
}

export function summarizeMovements(workout: WorkoutLike): MovementSummary[] {
  const groups = new Map<string, WorkoutSetLike[]>();

  for (const set of workout.sets) {
    const group = groups.get(set.movement.id);
    if (group) {
      group.push(set);
    } else {
      groups.set(set.movement.id, [set]);
    }
  }

  return Array.from(groups.values())
    .map((sets) => {
      const first = sets[0];
      const totalReps = sets.reduce((sum, set) => sum + set.reps, 0);
      const maxWeight = sets.reduce((max, set) => Math.max(max, set.weight), 0);

      return {
        movementId: first.movement.id,
        movementName: first.movement.name,
        isBodyweight: first.movement.isBodyweight,
        sets,
        setCount: sets.length,
        totalReps,
        maxWeight,
        totalVolume: sets.reduce((sum, set) => sum + setVolume(set), 0),
      };
    })
    .sort((a, b) => a.movementName.localeCompare(b.movementName));
}
