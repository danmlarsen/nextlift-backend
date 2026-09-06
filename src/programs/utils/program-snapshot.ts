import { ProgramSnapshot, ProgressionParams } from '../engine/types';
import { ProgramWithTree } from '../const/full-program-include';

/**
 * Serializes an authored program tree into the immutable enrollment snapshot.
 * Only the fields the engine and the overview need are kept.
 */
export function toSnapshot(program: ProgramWithTree): ProgramSnapshot {
  return {
    id: program.id,
    version: program.version,
    name: program.name,
    description: program.description,
    credit: program.credit,
    goal: program.goal,
    level: program.level,
    scheduleMode: program.scheduleMode,
    durationMode: program.durationMode,
    daysPerWeek: program.daysPerWeek,
    effortScale: program.effortScale,
    blocks: program.blocks.map((block) => ({
      id: block.id,
      blockOrder: block.blockOrder,
      name: block.name,
      focus: block.focus,
      weeks: block.weeks.map((week) => ({
        id: week.id,
        weekInBlock: week.weekInBlock,
        label: week.label,
        isDeload: week.isDeload,
        volumeMultiplier: week.volumeMultiplier,
        intensityMultiplier: week.intensityMultiplier,
      })),
      days: block.days.map((day) => ({
        id: day.id,
        dayOrder: day.dayOrder,
        name: day.name,
        weekday: day.weekday,
        notes: day.notes,
        exercises: day.exercises.map((exercise) => ({
          id: exercise.id,
          exerciseId: exercise.exerciseId,
          exerciseOrder: exercise.exerciseOrder,
          progressionKey: exercise.progressionKey,
          strategy: exercise.strategy,
          progression: exercise.progression as ProgressionParams | null,
          roundingKg: exercise.roundingKg,
          restSeconds: exercise.restSeconds,
          notes: exercise.notes,
          exercise: exercise.exercise,
          sets: exercise.sets.map((set) => ({
            id: set.id,
            weekInBlock: set.weekInBlock,
            setOrder: set.setOrder,
            type: set.type,
            repsMin: set.repsMin,
            repsMax: set.repsMax,
            isAmrap: set.isAmrap,
            percent: set.percent,
            weight: set.weight,
            targetRpe: set.targetRpe,
            restSeconds: set.restSeconds,
            duration: set.duration,
            notes: set.notes,
          })),
        })),
      })),
    })),
  };
}

/** Reads a stored snapshot back; the column is typed as JSON by Prisma. */
export function parseSnapshot(value: unknown): ProgramSnapshot {
  return value as ProgramSnapshot;
}
