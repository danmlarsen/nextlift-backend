import {
  ExerciseState,
  ProgramSnapshot,
  ProgressionParams,
  ResolvedSet,
  SetResult,
  SnapshotBlock,
  SnapshotDay,
  SnapshotExercise,
  SnapshotSet,
  SnapshotWeek,
} from '../types';

let nextId = 1;
const takeId = () => nextId++;
export const resetFixtureIds = () => {
  nextId = 1;
};

export function makeSet(partial: Partial<SnapshotSet> = {}): SnapshotSet {
  return {
    id: takeId(),
    weekInBlock: null,
    setOrder: 1,
    type: 'normal',
    repsMin: null,
    repsMax: null,
    isAmrap: false,
    percent: null,
    weight: null,
    targetRpe: null,
    restSeconds: null,
    duration: null,
    notes: null,
    ...partial,
  };
}

/** `count` working sets numbered 1..count sharing the given fields. */
export function makeSets(
  count: number,
  partial: Partial<SnapshotSet> = {},
  options: { amrapLast?: boolean; weekInBlock?: number | null } = {},
): SnapshotSet[] {
  return Array.from({ length: count }, (_, index) =>
    makeSet({
      ...partial,
      setOrder: index + 1,
      weekInBlock: options.weekInBlock ?? partial.weekInBlock ?? null,
      isAmrap: !!options.amrapLast && index === count - 1,
    }),
  );
}

export function makeExercise(
  partial: Partial<SnapshotExercise> & {
    progression?: ProgressionParams | null;
    name?: string;
  } = {},
): SnapshotExercise {
  const id = partial.id ?? takeId();
  const exerciseId = partial.exerciseId ?? 100 + id;
  const { name, ...rest } = partial;
  return {
    id,
    exerciseId,
    exerciseOrder: 1,
    progressionKey: `key-${id}`,
    strategy: partial.progression?.strategy ?? 'NONE',
    progression: null,
    roundingKg: null,
    restSeconds: null,
    notes: null,
    exercise: {
      id: exerciseId,
      name: name ?? `Exercise ${exerciseId}`,
      equipment: 'barbell',
      category: 'strength',
    },
    sets: [],
    ...rest,
  };
}

export function makeDay(partial: Partial<SnapshotDay> = {}): SnapshotDay {
  const exercises = (partial.exercises ?? []).map((exercise, index) => ({
    ...exercise,
    exerciseOrder: exercise.exerciseOrder || index + 1,
  }));
  return {
    id: takeId(),
    dayOrder: 1,
    name: 'Day',
    weekday: null,
    notes: null,
    ...partial,
    exercises,
  };
}

export function makeWeek(
  weekInBlock: number,
  partial: Partial<SnapshotWeek> = {},
): SnapshotWeek {
  return {
    id: takeId(),
    weekInBlock,
    label: null,
    isDeload: false,
    volumeMultiplier: 1,
    intensityMultiplier: 1,
    ...partial,
  };
}

export function makeBlock(
  partial: Partial<SnapshotBlock> & { weekCount?: number } = {},
): SnapshotBlock {
  const { weekCount, ...rest } = partial;
  const weeks =
    partial.weeks ??
    Array.from({ length: weekCount ?? 1 }, (_, index) => makeWeek(index + 1));
  const days = (partial.days ?? []).map((day, index) => ({
    ...day,
    dayOrder: index + 1,
  }));
  return {
    id: takeId(),
    blockOrder: 1,
    name: 'Block',
    focus: null,
    ...rest,
    weeks,
    days,
  };
}

export function makeProgram(
  blocks: SnapshotBlock[],
  partial: Partial<ProgramSnapshot> = {},
): ProgramSnapshot {
  return {
    id: 1,
    version: 1,
    name: 'Test program',
    description: null,
    credit: null,
    goal: 'STRENGTH',
    level: 'BEGINNER',
    scheduleMode: 'SEQUENCE',
    durationMode: 'FIXED',
    daysPerWeek: 3,
    effortScale: 'RPE',
    ...partial,
    blocks: blocks.map((block, index) => ({ ...block, blockOrder: index + 1 })),
  };
}

export function makeState(
  partial: Partial<ExerciseState> & { progressionKey: string },
): ExerciseState {
  return {
    exerciseId: 1,
    workingWeight: null,
    trainingMax: null,
    e1rm: null,
    stageIndex: 0,
    consecutiveFails: 0,
    repsOffset: 0,
    roundingKg: null,
    ...partial,
  };
}

export function statesMap(
  ...states: ExerciseState[]
): Map<string, ExerciseState> {
  return new Map(states.map((state) => [state.progressionKey, state]));
}

/** A logged outcome for a resolved set; defaults to hitting the prescription. */
export function makeResult(
  set: ResolvedSet,
  actual: Partial<
    Pick<SetResult, 'completed' | 'reps' | 'weight' | 'rpe'>
  > = {},
): SetResult {
  return {
    programSetId: set.programSetId,
    type: set.type,
    completed: actual.completed ?? true,
    reps: actual.reps === undefined ? set.repsMin : actual.reps,
    weight: actual.weight === undefined ? set.weight : actual.weight,
    rpe: actual.rpe ?? null,
    prescribed: {
      repsMin: set.repsMin,
      repsMax: set.repsMax,
      isAmrap: set.isAmrap,
      weight: set.weight,
      targetRpe: set.targetRpe,
    },
  };
}

export function makeResults(
  sets: ResolvedSet[],
  actual: Partial<
    Pick<SetResult, 'completed' | 'reps' | 'weight' | 'rpe'>
  > = {},
): SetResult[] {
  return sets.map((set) => makeResult(set, actual));
}

export const GZCLP_T1 = (increment: number): ProgressionParams => ({
  strategy: 'LINEAR',
  incrementKg: increment,
  failThreshold: 1,
  deloadPercent: 15,
  stages: [
    { sets: 5, reps: 3, amrapLast: true },
    { sets: 6, reps: 2, amrapLast: true },
    { sets: 10, reps: 1, amrapLast: true },
  ],
  stageResetPercent: 85,
});

export const GZCLP_T2 = (increment: number): ProgressionParams => ({
  strategy: 'LINEAR',
  incrementKg: increment,
  failThreshold: 1,
  deloadPercent: 10,
  stages: [
    { sets: 3, reps: 10 },
    { sets: 3, reps: 8 },
    { sets: 3, reps: 6 },
  ],
});

export const GZCLP_T3: ProgressionParams = {
  strategy: 'LINEAR',
  incrementKg: 2.5,
  amrapRepsThreshold: 25,
};

/** Day A1 of a GZCLP-style rotation: T1 squat, T2 bench, T3 lat pulldown. */
export function gzclpDayA1(): SnapshotDay {
  return makeDay({
    name: 'A1',
    exercises: [
      makeExercise({
        name: 'Barbell Squat',
        exerciseId: 1,
        progressionKey: 't1-squat',
        progression: GZCLP_T1(5),
        restSeconds: 180,
        sets: makeSets(5, { repsMin: 3, repsMax: 3 }, { amrapLast: true }),
      }),
      makeExercise({
        name: 'Barbell Bench Press',
        exerciseId: 2,
        progressionKey: 't2-bench',
        progression: GZCLP_T2(2.5),
        restSeconds: 120,
        sets: makeSets(3, { repsMin: 10, repsMax: 10 }),
      }),
      makeExercise({
        name: 'Lat Pulldown',
        exerciseId: 3,
        progressionKey: 't3-lat-pulldown',
        progression: GZCLP_T3,
        restSeconds: 90,
        sets: makeSets(3, { repsMin: 15, repsMax: 15 }, { amrapLast: true }),
      }),
    ],
  });
}

export function gzclpProgram(): ProgramSnapshot {
  return makeProgram(
    [
      makeBlock({
        name: 'Rotation',
        weekCount: 1,
        days: [
          gzclpDayA1(),
          makeDay({ name: 'B1', exercises: [] }),
          makeDay({ name: 'A2', exercises: [] }),
          makeDay({ name: 'B2', exercises: [] }),
        ],
      }),
    ],
    { durationMode: 'OPEN_ENDED', daysPerWeek: 3 },
  );
}
