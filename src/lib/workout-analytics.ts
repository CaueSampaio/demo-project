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

export type VolumeRow = { date: Date; movementName: string; volume: number };

export type VolumeOverview = { rows: VolumeRow[]; series: string[]; selectedDate: Date | null };

function toDate(date: Date | string): Date {
  return date instanceof Date ? date : new Date(date);
}

function setVolume(set: WorkoutSetLike): number {
  return set.weight * set.reps;
}

function completedTime(workout: WorkoutLike): number | null {
  if (workout.completedAt === null) return null;
  return toDate(workout.completedAt).getTime();
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

export function sixWorkoutWindow(workouts: WorkoutLike[], selectedId: string): WorkoutLike[] {
  const dated = workouts
    .map((workout) => ({ workout, time: completedTime(workout) }))
    .filter((entry): entry is { workout: WorkoutLike; time: number } => entry.time !== null)
    .sort((a, b) => b.time - a.time);

  const selectedIndex = dated.findIndex((entry) => entry.workout.id === selectedId);
  if (selectedIndex === -1) return [];

  return dated
    .slice(selectedIndex, selectedIndex + 6)
    .map((entry) => entry.workout)
    .reverse();
}

export function volumeOverviewSeries(workouts: WorkoutLike[], selectedId: string): VolumeOverview {
  const window = sixWorkoutWindow(workouts, selectedId);
  const selected = window[window.length - 1];

  if (!selected || selected.completedAt === null) {
    return { rows: [], series: [], selectedDate: null };
  }

  const candidates = new Map<string, string>();
  for (const set of selected.sets) {
    if (!candidates.has(set.movement.id)) {
      candidates.set(set.movement.id, set.movement.name);
    }
  }

  const totalsByMovement = new Map<string, number>();
  for (const movementId of candidates.keys()) {
    totalsByMovement.set(movementId, 0);
  }
  for (const workout of window) {
    for (const set of workout.sets) {
      if (!candidates.has(set.movement.id)) continue;
      totalsByMovement.set(set.movement.id, (totalsByMovement.get(set.movement.id) ?? 0) + setVolume(set));
    }
  }

  const ranked = Array.from(candidates.entries())
    .map(([movementId, movementName]) => ({
      movementId,
      movementName,
      totalVolume: totalsByMovement.get(movementId) ?? 0,
    }))
    .sort((a, b) => b.totalVolume - a.totalVolume || a.movementName.localeCompare(b.movementName));

  const top = ranked.slice(0, 5);
  const rest = ranked.slice(5);
  const series = top.map((entry) => entry.movementName);
  if (rest.length > 0) series.push("Other");

  const rows: VolumeRow[] = [];
  for (const workout of window) {
    const date = toDate(workout.completedAt as Date | string);
    const volumes = new Map<string, number>();
    for (const set of workout.sets) {
      if (!candidates.has(set.movement.id)) continue;
      volumes.set(set.movement.id, (volumes.get(set.movement.id) ?? 0) + setVolume(set));
    }

    for (const entry of top) {
      rows.push({
        date,
        movementName: entry.movementName,
        volume: volumes.get(entry.movementId) ?? 0,
      });
    }

    if (rest.length > 0) {
      rows.push({
        date,
        movementName: "Other",
        volume: rest.reduce((sum, entry) => sum + (volumes.get(entry.movementId) ?? 0), 0),
      });
    }
  }

  return {
    rows,
    series,
    selectedDate: toDate(selected.completedAt),
  };
}
