import { roundLoad } from '../rounding';
import {
  ExerciseState,
  LoadBasis,
  ProgressionEvent,
  ProgressionEventKind,
  ResolvedSet,
  SetResult,
  SnapshotExercise,
  SnapshotSet,
} from '../types';

export const WARMUP_TYPE = 'warmup';

export function isWorkingRow(set: { type: string }): boolean {
  return set.type !== WARMUP_TYPE;
}

/** Base resolved set for a snapshot row; strategies override load fields. */
export function toResolvedSet(
  row: SnapshotSet,
  exercise: SnapshotExercise,
  overrides: Partial<ResolvedSet> = {},
): ResolvedSet {
  return {
    programSetId: row.id,
    setOrder: row.setOrder,
    type: row.type,
    repsMin: row.repsMin,
    repsMax: row.repsMax ?? row.repsMin,
    isAmrap: row.isAmrap,
    targetRpe: row.targetRpe,
    restSeconds: row.restSeconds ?? exercise.restSeconds,
    duration: row.duration,
    weight: null,
    percent: row.percent,
    basis: null,
    notes: row.notes,
    ...overrides,
  };
}

/** Load from a basis value and an optional percentage, rounded; null stays null. */
export function loadFromBasis(
  basisValue: number | null,
  percent: number | null,
  rounding: number,
): number | null {
  if (basisValue === null) return null;
  return roundLoad(basisValue * ((percent ?? 100) / 100), rounding);
}

/** Warm-up rows resolve against the working load when they carry a percent. */
export function resolveWarmups(
  rows: SnapshotSet[],
  exercise: SnapshotExercise,
  basisValue: number | null,
  basis: LoadBasis,
  rounding: number,
): ResolvedSet[] {
  return rows
    .filter((row) => !isWorkingRow(row))
    .map((row) =>
      toResolvedSet(row, exercise, {
        weight:
          row.percent !== null
            ? loadFromBasis(basisValue, row.percent, rounding)
            : row.weight,
        basis:
          row.percent !== null ? basis : row.weight !== null ? 'FIXED' : null,
      }),
    );
}

export function renumber(sets: ResolvedSet[]): ResolvedSet[] {
  return sets.map((set, index) => ({ ...set, setOrder: index + 1 }));
}

/**
 * Every prescribed set completed with the target reps and at least the
 * prescribed load. `MAX` demands the top of the rep range (double progression).
 */
export function allPrescribedHit(
  results: SetResult[],
  mode: 'MIN' | 'MAX' = 'MIN',
): boolean {
  if (results.length === 0) return false;
  return results.every((result) => {
    if (!result.completed) return false;
    const target =
      mode === 'MAX'
        ? (result.prescribed.repsMax ?? result.prescribed.repsMin)
        : result.prescribed.repsMin;
    if (target !== null && (result.reps ?? 0) < target) return false;
    if (
      result.prescribed.weight !== null &&
      (result.weight ?? 0) < result.prescribed.weight - 0.01
    ) {
      return false;
    }
    return true;
  });
}

export function maxCompletedWeight(results: SetResult[]): number | null {
  let max: number | null = null;
  for (const result of results) {
    if (!result.completed || result.weight === null || result.weight <= 0)
      continue;
    if (max === null || result.weight > max) max = result.weight;
  }
  return max;
}

export function amrapResult(results: SetResult[]): SetResult | undefined {
  return results.find((result) => result.prescribed.isAmrap);
}

export function makeEvent(
  exercise: SnapshotExercise,
  state: ExerciseState,
  kind: ProgressionEventKind,
  from: number | null,
  to: number | null,
  message: string,
): ProgressionEvent {
  return {
    progressionKey: state.progressionKey,
    exerciseId: state.exerciseId,
    exerciseName: exercise.exercise.name,
    kind,
    from,
    to,
    message,
  };
}

export function formatKg(value: number): string {
  return `${Number(value.toFixed(2))} kg`;
}
