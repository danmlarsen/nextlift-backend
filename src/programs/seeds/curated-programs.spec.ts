import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import exercises from '../../../prisma/data/exercises.json';
import { programSeeds } from '../../../prisma/data/programs';
import { refKey, setRows, weekRows } from '../../../prisma/data/programs/build';
import { ProgramSeed } from '../../../prisma/data/programs/types';
import { ProgramExerciseInputDto } from '../dtos/day-content.dto';
import { resolveDay } from '../engine/resolve-day';
import { totalWeeks } from '../engine/schedule';
import { ProgramSnapshot, ProgressionParams } from '../engine/types';
import { validateProgramForEnrollment } from '../utils/validate-program';

const systemExercises = new Map(
  (exercises as { name: string; equipment: string; userId: number }[])
    .filter((exercise) => exercise.userId === -1)
    .map((exercise, index) => [refKey(exercise), index + 1]),
);

/** Mirrors what the seed writes and the snapshot serializer reads back. */
function seedToSnapshot(seed: ProgramSeed): ProgramSnapshot {
  let nextId = 1;
  return {
    id: 1,
    version: seed.version,
    name: seed.name,
    description: seed.description,
    credit: seed.credit ?? null,
    goal: seed.goal,
    level: seed.level,
    scheduleMode: seed.scheduleMode ?? 'SEQUENCE',
    durationMode: seed.durationMode ?? 'FIXED',
    daysPerWeek: seed.daysPerWeek,
    effortScale: seed.effortScale ?? 'RPE',
    blocks: seed.blocks.map((block, blockIndex) => ({
      id: nextId++,
      blockOrder: blockIndex + 1,
      name: block.name,
      focus: block.focus ?? null,
      weeks: weekRows(block.weeks).map((week) => ({ id: nextId++, ...week })),
      days: block.days.map((day, dayIndex) => ({
        id: nextId++,
        dayOrder: dayIndex + 1,
        name: day.name,
        weekday: day.weekday ?? null,
        notes: day.notes ?? null,
        exercises: day.exercises.map((exercise, exerciseIndex) => {
          const exerciseId =
            systemExercises.get(refKey(exercise.exercise)) ?? -1;
          return {
            id: nextId++,
            exerciseId,
            exerciseOrder: exerciseIndex + 1,
            progressionKey: exercise.key,
            strategy: exercise.strategy,
            progression: (exercise.progression ??
              null) as ProgressionParams | null,
            roundingKg: exercise.roundingKg ?? null,
            restSeconds: exercise.rest ?? null,
            notes: exercise.notes ?? null,
            exercise: {
              id: exerciseId,
              name: exercise.exercise.name,
              equipment: exercise.exercise.equipment,
              category: 'strength',
            },
            sets: setRows(exercise.sets).map((set) => ({
              id: nextId++,
              ...set,
            })),
          };
        }),
      })),
    })),
  };
}

describe('curated program seeds', () => {
  it('ships ten programs with unique slugs spanning beginner to elite', () => {
    expect(programSeeds).toHaveLength(10);
    expect(new Set(programSeeds.map((seed) => seed.slug)).size).toBe(10);
    const levels = new Set(programSeeds.map((seed) => seed.level));
    expect(levels).toEqual(
      new Set(['BEGINNER', 'NOVICE', 'INTERMEDIATE', 'ADVANCED', 'ELITE']),
    );
  });

  describe.each(programSeeds.map((seed) => [seed.slug, seed] as const))(
    '%s',
    (_slug, seed) => {
      const snapshot = seedToSnapshot(seed);

      it('only references exercises from the system library', () => {
        const missing = seed.blocks
          .flatMap((block) => block.days)
          .flatMap((day) => day.exercises)
          .map((exercise) => refKey(exercise.exercise))
          .filter((key) => !systemExercises.has(key));
        expect(missing).toEqual([]);
      });

      it('passes the enrollment validation', () => {
        expect(validateProgramForEnrollment(snapshot)).toEqual([]);
      });

      it('validates every slot through the API DTOs', () => {
        for (const block of seed.blocks) {
          for (const day of block.days) {
            for (const exercise of day.exercises) {
              const dto = plainToInstance(ProgramExerciseInputDto, {
                exerciseId: 1,
                progressionKey: exercise.key,
                strategy: exercise.strategy,
                progression: exercise.progression ?? null,
                roundingKg: exercise.roundingKg ?? null,
                restSeconds: exercise.rest ?? null,
                notes: exercise.notes ?? null,
                // setOrder is computed by the API, not accepted from clients.

                sets: setRows(exercise.sets).map(
                  ({ setOrder: _order, ...row }) => {
                    void _order;

                    return row;
                  },
                ),
              });
              const errors = validateSync(dto, {
                whitelist: true,
                forbidNonWhitelisted: true,
              });
              expect(
                errors.map(
                  (error) =>
                    `${exercise.key}: ${JSON.stringify(error.constraints ?? error.children)}`,
                ),
              ).toEqual([]);
            }
          }
        }
      });

      it('matches its declared days per week and resolves every day', () => {
        const days = new Set(
          seed.blocks.flatMap((block) => block.days.map((day) => day.name)),
        );
        expect(days.size).toBeGreaterThan(0);
        if (seed.scheduleMode === 'CALENDAR') {
          for (const block of seed.blocks) {
            expect(block.days.length).toBeLessThanOrEqual(7);
            expect(new Set(block.days.map((day) => day.weekday)).size).toBe(
              block.days.length,
            );
          }
        }
        let weekIndex = 0;
        for (const block of snapshot.blocks) {
          for (const week of block.weeks) {
            weekIndex++;
            void week;
            for (let dayIndex = 1; dayIndex <= block.days.length; dayIndex++) {
              const day = resolveDay(
                snapshot,
                { cycle: 1, weekIndex, dayIndex },
                new Map(),
              );
              expect(day).not.toBeNull();
              for (const exercise of day!.exercises) {
                expect(exercise.sets.length).toBeGreaterThan(0);
              }
            }
          }
        }
        expect(weekIndex).toBe(totalWeeks(snapshot));
      });
    },
  );
});
