import { Prisma } from '@prisma/client';
import { ProgramSeed, SeedBlock, SeedExerciseRef, SeedSet, SeedWeek } from './types';

export type ExerciseResolver = (ref: SeedExerciseRef) => number;

export function refKey(ref: SeedExerciseRef): string {
  return `${ref.name}|${ref.equipment}`;
}

export function weekRows(weeks: number | SeedWeek[]) {
  const list: SeedWeek[] =
    typeof weeks === 'number'
      ? Array.from({ length: weeks }, () => ({}))
      : weeks;
  return list.map((week, index) => ({
    weekInBlock: index + 1,
    label: week.label ?? null,
    isDeload: week.deload ?? false,
    volumeMultiplier: week.volume ?? 1,
    intensityMultiplier: week.intensity ?? 1,
  }));
}

/** Set rows keep their order inside each week scope, like the API does. */
export function setRows(sets: SeedSet[]) {
  const counters = new Map<number | null, number>();
  return sets.map((set) => {
    const scope = set.week ?? null;
    const order = (counters.get(scope) ?? 0) + 1;
    counters.set(scope, order);
    const repsMin = set.repsMin ?? set.reps ?? null;
    return {
      weekInBlock: scope,
      setOrder: order,
      type: set.type ?? 'normal',
      repsMin,
      repsMax: set.repsMax ?? repsMin,
      isAmrap: set.amrap ?? false,
      percent: set.percent ?? null,
      weight: set.weight ?? null,
      targetRpe: set.rpe ?? null,
      restSeconds: set.rest ?? null,
      duration: set.duration ?? null,
      notes: set.notes ?? null,
    };
  });
}

export function blockCreate(
  block: SeedBlock,
  blockOrder: number,
  resolve: ExerciseResolver,
): Prisma.ProgramBlockCreateWithoutProgramInput {
  return {
    blockOrder,
    name: block.name,
    focus: block.focus ?? null,
    weeks: { create: weekRows(block.weeks) },
    days: {
      create: block.days.map((day, dayIndex) => ({
        dayOrder: dayIndex + 1,
        name: day.name,
        weekday: day.weekday ?? null,
        notes: day.notes ?? null,
        exercises: {
          create: day.exercises.map((exercise, exerciseIndex) => ({
            exercise: { connect: { id: resolve(exercise.exercise) } },
            exerciseOrder: exerciseIndex + 1,
            progressionKey: exercise.key,
            strategy: exercise.strategy,
            progression:
              exercise.progression === null || exercise.progression === undefined
                ? Prisma.DbNull
                : (exercise.progression as Prisma.InputJsonValue),
            roundingKg: exercise.roundingKg ?? null,
            restSeconds: exercise.rest ?? null,
            notes: exercise.notes ?? null,
            sets: { create: setRows(exercise.sets) },
          })),
        },
      })),
    },
  };
}

export function programMeta(seed: ProgramSeed) {
  return {
    name: seed.name,
    description: seed.description,
    credit: seed.credit ?? null,
    goal: seed.goal,
    level: seed.level,
    scheduleMode: seed.scheduleMode ?? 'SEQUENCE',
    durationMode: seed.durationMode ?? 'FIXED',
    daysPerWeek: seed.daysPerWeek,
    effortScale: seed.effortScale ?? 'RPE',
  } as const;
}

export function blocksCreate(
  seed: ProgramSeed,
  resolve: ExerciseResolver,
): Prisma.ProgramBlockCreateWithoutProgramInput[] {
  return seed.blocks.map((block, index) => blockCreate(block, index + 1, resolve));
}
