import { Prisma } from '@prisma/client';
import { ResolvedSet } from '../engine/types';

/**
 * Maps a resolved program day's sets to the create inputs of a fresh workout's
 * sets. Like the template copy, prescriptions land in the suggested* fields
 * and never as actuals; `programSetId` marks the set as program-generated so
 * the engine evaluates it (and ignores sets the user adds).
 */
export function mapResolvedSetsToWorkoutSetCreates(
  sets: ResolvedSet[],
): Prisma.WorkoutSetCreateWithoutWorkoutExerciseInput[] {
  return sets.map((set, index) => ({
    setNumber: index + 1,
    type: set.type,
    notes: set.notes,
    completed: false,
    programSetId: set.programSetId,
    suggestedReps: set.repsMin,
    suggestedRepsMax: set.repsMax,
    suggestedWeight: set.weight,
    suggestedDuration: set.duration,
    suggestedRpe: set.targetRpe,
    suggestedRestSeconds: set.restSeconds,
    suggestedAmrap: set.isAmrap,
  }));
}
