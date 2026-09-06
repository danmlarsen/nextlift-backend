import {
  BENCH,
  DB_ROW,
  DEADLIFT,
  LAT_PULLDOWN,
  linear,
  OHP,
  sets,
  slot,
  SQUAT,
} from './helpers';
import { ProgramSeed, SeedExercise, SeedExerciseRef } from './types';

const t1 = (exercise: SeedExerciseRef, key: string, increment: number): SeedExercise =>
  slot(
    exercise,
    key,
    'LINEAR',
    linear(increment, {
      failThreshold: 1,
      deloadPercent: 15,
      stages: [
        { sets: 5, reps: 3, amrapLast: true },
        { sets: 6, reps: 2, amrapLast: true },
        { sets: 10, reps: 1, amrapLast: true },
      ],
      stageResetPercent: 85,
    }),
    sets(5, { reps: 3 }, true),
    { rest: 180 },
  );

const t2 = (exercise: SeedExerciseRef, key: string, increment: number): SeedExercise =>
  slot(
    exercise,
    key,
    'LINEAR',
    linear(increment, {
      failThreshold: 1,
      deloadPercent: 10,
      stages: [
        { sets: 3, reps: 10 },
        { sets: 3, reps: 8 },
        { sets: 3, reps: 6 },
      ],
    }),
    sets(3, { reps: 10 }),
    { rest: 120 },
  );

const t3 = (exercise: SeedExerciseRef, key: string, roundingKg = 2.5): SeedExercise =>
  slot(exercise, key, 'LINEAR', linear(2.5, { amrapRepsThreshold: 25 }), sets(3, { reps: 15 }, true), {
    rest: 90,
    roundingKg,
  });

export const tieredLinear: ProgramSeed = {
  slug: 'tiered-linear-3-day',
  version: 1,
  name: 'Tiered Linear Progression',
  description:
    'Four rotating workouts trained three days a week. Each session has a heavy tier-1 lift (5×3+ that falls back to 6×2+ and 10×1+ before resetting), a tier-2 lift for volume (3×10 → 3×8 → 3×6) and a tier-3 accessory done for 3×15+ that only goes up once the last set reaches 25 reps.',
  credit: 'Inspired by GZCLP (Cody Lefever)',
  goal: 'STRENGTH',
  level: 'BEGINNER',
  scheduleMode: 'SEQUENCE',
  durationMode: 'OPEN_ENDED',
  daysPerWeek: 3,
  blocks: [
    {
      name: 'Rotation',
      weeks: 1,
      days: [
        { name: 'A1', exercises: [t1(SQUAT, 't1-squat', 5), t2(BENCH, 't2-bench', 2.5), t3(LAT_PULLDOWN, 't3-lat-pulldown')] },
        { name: 'B1', exercises: [t1(OHP, 't1-ohp', 2.5), t2(DEADLIFT, 't2-deadlift', 5), t3(DB_ROW, 't3-db-row', 2)] },
        { name: 'A2', exercises: [t1(BENCH, 't1-bench', 2.5), t2(SQUAT, 't2-squat', 5), t3(LAT_PULLDOWN, 't3-lat-pulldown')] },
        { name: 'B2', exercises: [t1(DEADLIFT, 't1-deadlift', 5), t2(OHP, 't2-ohp', 2.5), t3(DB_ROW, 't3-db-row', 2)] },
      ],
    },
  ],
};
