import {
  MAX_DAYS_PER_BLOCK,
  MAX_EXERCISES_PER_PROGRAM_DAY,
  MAX_PROGRAM_BLOCKS,
  MAX_PROGRAM_WEEKS,
} from 'src/common/constants';
import { ProgramSnapshot } from '../engine/types';

export type WeekdayMapInput = Record<string, unknown> | null | undefined;

/**
 * Structural checks a program must pass before anyone can enroll in it.
 * Returns human-readable problems; an empty list means the program is usable.
 */
export function validateProgramForEnrollment(
  snapshot: ProgramSnapshot,
): string[] {
  const problems: string[] = [];

  if (snapshot.blocks.length === 0) problems.push('The program has no blocks');
  if (snapshot.blocks.length > MAX_PROGRAM_BLOCKS) {
    problems.push(`A program can have at most ${MAX_PROGRAM_BLOCKS} blocks`);
  }

  const totalWeeks = snapshot.blocks.reduce(
    (sum, block) => sum + block.weeks.length,
    0,
  );
  if (totalWeeks === 0) problems.push('The program has no weeks');
  if (totalWeeks > MAX_PROGRAM_WEEKS) {
    problems.push(`A program can have at most ${MAX_PROGRAM_WEEKS} weeks`);
  }

  const keyExercise = new Map<string, number>();
  const keyStrategy = new Map<string, string>();
  const usedWeekdays = new Set<string>();

  for (const block of snapshot.blocks) {
    if (block.days.length === 0) {
      problems.push(`Block "${block.name}" has no days`);
    }
    if (block.days.length > MAX_DAYS_PER_BLOCK) {
      problems.push(
        `Block "${block.name}" has more than ${MAX_DAYS_PER_BLOCK} days`,
      );
    }
    for (const day of block.days) {
      if (day.exercises.length === 0) {
        problems.push(
          `Day "${day.name}" in block "${block.name}" has no exercises`,
        );
      }
      if (day.exercises.length > MAX_EXERCISES_PER_PROGRAM_DAY) {
        problems.push(
          `Day "${day.name}" has more than ${MAX_EXERCISES_PER_PROGRAM_DAY} exercises`,
        );
      }
      if (snapshot.scheduleMode === 'CALENDAR') {
        if (day.weekday === null) {
          problems.push(
            `Day "${day.name}" needs a weekday in a calendar program`,
          );
        } else {
          const slotKey = `${block.id}:${day.weekday}`;
          if (usedWeekdays.has(slotKey)) {
            problems.push(
              `Two days in block "${block.name}" share the same weekday`,
            );
          }
          usedWeekdays.add(slotKey);
        }
      }
      for (const exercise of day.exercises) {
        if (exercise.sets.length === 0) {
          problems.push(
            `"${exercise.exercise.name}" on day "${day.name}" has no sets`,
          );
        }
        const strategy = exercise.progression?.strategy ?? exercise.strategy;
        if (exercise.strategy !== 'NONE' && !exercise.progression) {
          problems.push(
            `"${exercise.exercise.name}" on day "${day.name}" is missing progression settings`,
          );
        }
        const knownExercise = keyExercise.get(exercise.progressionKey);
        if (
          knownExercise !== undefined &&
          knownExercise !== exercise.exerciseId
        ) {
          problems.push(
            `Progression key "${exercise.progressionKey}" is used by two different exercises`,
          );
        }
        keyExercise.set(exercise.progressionKey, exercise.exerciseId);
        const knownStrategy = keyStrategy.get(exercise.progressionKey);
        if (
          knownStrategy !== undefined &&
          knownStrategy !== 'NONE' &&
          strategy !== 'NONE' &&
          knownStrategy !== strategy
        ) {
          problems.push(
            `Progression key "${exercise.progressionKey}" mixes strategies ${knownStrategy} and ${strategy}`,
          );
        }
        if (knownStrategy === undefined || knownStrategy === 'NONE') {
          keyStrategy.set(exercise.progressionKey, strategy);
        }
      }
    }
  }

  return [...new Set(problems)];
}

/**
 * A weekday override map must reference days of the snapshot, use weekdays
 * 1..7, and keep weekdays unique inside each block.
 */
export function validateWeekdayMap(
  snapshot: ProgramSnapshot,
  weekdayMap: WeekdayMapInput,
): string[] {
  if (!weekdayMap) return [];
  const problems: string[] = [];
  const dayIds = new Map<string, { blockId: number; weekday: number | null }>();
  for (const block of snapshot.blocks) {
    for (const day of block.days) {
      dayIds.set(String(day.id), { blockId: block.id, weekday: day.weekday });
    }
  }
  for (const [key, value] of Object.entries(weekdayMap)) {
    if (!dayIds.has(key)) problems.push(`Unknown program day ${key}`);
    if (
      !Number.isInteger(value) ||
      (value as number) < 1 ||
      (value as number) > 7
    ) {
      problems.push(
        `Weekday for day ${key} must be between 1 (Monday) and 7 (Sunday)`,
      );
    }
  }
  if (problems.length > 0) return problems;

  for (const block of snapshot.blocks) {
    const seen = new Set<number>();
    for (const day of block.days) {
      const weekday =
        (weekdayMap[String(day.id)] as number | undefined) ?? day.weekday;
      if (weekday === null || weekday === undefined) continue;
      if (seen.has(weekday)) {
        problems.push(
          `Two days in block "${block.name}" would share the same weekday`,
        );
      }
      seen.add(weekday);
    }
  }
  return problems;
}
