import { SeedExercise, SeedExerciseRef, SeedSet, SeedStrategy } from './types';

export const ex = (name: string, equipment: string): SeedExerciseRef => ({
  name,
  equipment,
});

// System exercises used by the curated programs (name + equipment as seeded).
export const SQUAT = ex('Barbell Squat', 'barbell');
export const FRONT_SQUAT = ex('Front Squat', 'barbell');
export const BENCH = ex('Barbell Bench Press', 'barbell');
export const CLOSE_GRIP_BENCH = ex('Close Grip Bench Press', 'barbell');
export const INCLINE_BENCH_BB = ex('Incline Bench Press', 'barbell');
export const INCLINE_BENCH_DB = ex('Incline Bench Press', 'dumbbell');
export const DEADLIFT = ex('Deadlift', 'barbell');
export const RDL = ex('Romanian Deadlift', 'barbell');
export const OHP = ex('Overhead Press', 'barbell');
export const ROW = ex('Barbell Row', 'barbell');
export const LAT_PULLDOWN = ex('Lat Pulldown', 'cable');
export const SEATED_ROW = ex('Seated Row', 'cable');
export const CABLE_ROW = ex('Cable Row', 'cable');
export const CHEST_SUPPORTED_ROW = ex('Chest Supported Row', 'machine');
export const FACE_PULL = ex('Face Pull', 'cable');
export const LATERAL_RAISE = ex('Lateral Raise', 'dumbbell');
export const TRICEP_PUSHDOWN = ex('Tricep Pushdown', 'cable');
export const TRICEP_OVERHEAD = ex('Triceps Overhead Extension', 'cable');
export const HAMMER_CURL = ex('Hammer Curl', 'dumbbell');
export const BICEPS_CURL = ex('Biceps Curl', 'dumbbell');
export const DB_ROW = ex('Dumbbell Row', 'dumbbell');
export const DB_OHP = ex('Dumbbell Overhead Press', 'dumbbell');
export const ARNOLD_PRESS = ex('Arnold Press', 'dumbbell');
export const GOBLET_SQUAT = ex('Goblet Squat', 'dumbbell');
export const DB_LUNGE = ex('Lunge', 'dumbbell');
export const DB_STIFF_LEG_DL = ex('Stiff Leg Deadlift', 'dumbbell');
export const RENEGADE_ROW = ex('Renegade Row', 'dumbbell');
export const LEG_PRESS = ex('Leg Press', 'machine');
export const HACK_SQUAT = ex('Hack Squat', 'machine');
export const LYING_LEG_CURL = ex('Lying Leg Curl', 'machine');
export const SEATED_LEG_CURL = ex('Seated Leg Curl', 'machine');
export const CALF_RAISE_MACHINE = ex('Calf Raise', 'machine');
export const SEATED_CALF_RAISE = ex('Seated Calf Raise', 'machine');
export const CHEST_PRESS = ex('Chest Press', 'machine');
export const CABLE_CRUNCH = ex('Cable Crunch', 'cable');
export const PULL_UP = ex('Pull Up', 'other');
export const CHIN_UP = ex('Chin Up', 'bodyweight');
export const DIP = ex('Dip', 'bodyweight');
export const PUSH_UP = ex('Push Up', 'bodyweight');
export const PLANK = ex('Plank', 'bodyweight');
export const DEAD_BUG = ex('Dead Bug', 'bodyweight');
export const GLUTE_BRIDGE = ex('Glute Bridge', 'bodyweight');
export const HANGING_LEG_RAISE = ex('Hanging Leg Raise', 'bodyweight');
export const STEP_UP = ex('Step Up', 'bodyweight');
export const RUSSIAN_TWIST = ex('Russian Twist', 'bodyweight');
export const BURPEE = ex('Burpee', 'bodyweight');

/** `count` working sets sharing the same prescription. */
export function sets(count: number, spec: SeedSet = {}, amrapLast = false): SeedSet[] {
  return Array.from({ length: count }, (_, index) => ({
    ...spec,
    ...(amrapLast && index === count - 1 ? { amrap: true } : {}),
  }));
}

export function range(count: number, repsMin: number, repsMax: number, spec: SeedSet = {}): SeedSet[] {
  return sets(count, { repsMin, repsMax, ...spec });
}

export function linear(
  incrementKg: number,
  options: Record<string, unknown> = {},
): Record<string, unknown> {
  return { strategy: 'LINEAR', incrementKg, ...options };
}

export function double(incrementKg: number, mode: 'LOAD' | 'REPS' = 'LOAD'): Record<string, unknown> {
  return mode === 'REPS'
    ? { strategy: 'DOUBLE', incrementKg: 0, mode: 'REPS', repsStep: 1 }
    : { strategy: 'DOUBLE', incrementKg, mode: 'LOAD' };
}

export function percentTm(
  tmIncrementKg: number,
  options: Record<string, unknown> = {},
): Record<string, unknown> {
  return { strategy: 'PERCENT_TM', tmIncrementKg, ...options };
}

export const supplementalFromTm = (): Record<string, unknown> => ({
  strategy: 'NONE',
  basis: 'TRAINING_MAX',
});

export const followWorkingWeight = (): Record<string, unknown> => ({
  strategy: 'NONE',
  basis: 'WORKING_WEIGHT',
});

export function rirMesocycle(incrementKg: number, maxSets = 5): Record<string, unknown> {
  return {
    strategy: 'RPE',
    mode: 'RIR_MESOCYCLE',
    startRir: 3,
    endRir: 0,
    addSetsPerWeek: 1,
    maxSets,
    incrementKg,
  };
}

export function topSetBackoff(backoffPercent: number, backoffSets: number): Record<string, unknown> {
  return { strategy: 'RPE', mode: 'TOP_SET_BACKOFF', backoffPercent, backoffSets };
}

export function slot(
  exercise: SeedExerciseRef,
  key: string,
  strategy: SeedStrategy,
  progression: Record<string, unknown> | null,
  setRows: SeedSet[],
  extras: Partial<Pick<SeedExercise, 'roundingKg' | 'rest' | 'notes'>> = {},
): SeedExercise {
  return { exercise, key, strategy, progression, sets: setRows, ...extras };
}

/** 5/3/1 main-work rows for a four-week wave (week 4 is the deload). */
export function wave531(): SeedSet[] {
  const weeks: [number, number, boolean][][] = [
    [[65, 5, false], [75, 5, false], [85, 5, true]],
    [[70, 3, false], [80, 3, false], [90, 3, true]],
    [[75, 5, false], [85, 3, false], [95, 1, true]],
    [[40, 5, false], [50, 5, false], [60, 5, false]],
  ];
  return weeks.flatMap((rows, weekIndex) =>
    rows.map(([percent, reps, amrap]) => ({ week: weekIndex + 1, percent, reps, amrap })),
  );
}

/** First-set-last supplemental: 5x5 at the week's opening percentage. */
export function fsl531(): SeedSet[] {
  return [65, 70, 75, 40].flatMap((percent, weekIndex) =>
    sets(5, { week: weekIndex + 1, percent, reps: 5 }),
  );
}

/** Rows that change percentage week by week (peaking blocks). */
export function weeklyPercents(
  count: number,
  reps: number,
  percents: number[],
  amrapLast = false,
): SeedSet[] {
  return percents.flatMap((percent, weekIndex) =>
    sets(count, { week: weekIndex + 1, percent, reps }, amrapLast),
  );
}

/** Top set rows whose RPE changes week by week (RTS-style blocks). */
export function weeklyTopSets(reps: number, rpes: number[]): SeedSet[] {
  return rpes.map((rpe, weekIndex) => ({ week: weekIndex + 1, reps, rpe }));
}
