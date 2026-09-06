import { DEFAULT_TM_PERCENT, trainingMaxFromE1rm } from './e1rm';
import { roundingFor } from './resolve-day';
import { paramsFor } from './strategies';
import {
  ExerciseState,
  ProgramSnapshot,
  ProgressionParams,
  SnapshotExercise,
} from './types';

export type StateField = 'workingWeight' | 'trainingMax' | 'e1rm';
export type DefaultSource = 'LAST_WORKOUT' | 'PR_1RM';

export type ExerciseHistory = {
  /** Heaviest completed working-set load in the most recent workout. */
  lastWorkingWeight: number | null;
  /** Estimated 1RM personal record. */
  e1rmRecord: number | null;
};

export type EnrollmentSlot = {
  progressionKey: string;
  exercise: SnapshotExercise;
  params: ProgressionParams;
};

export type EnrollmentDefault = {
  progressionKey: string;
  exerciseId: number;
  exerciseName: string;
  strategy: ProgressionParams['strategy'];
  /** Which state value this slot needs to prescribe loads; null = none. */
  field: StateField | null;
  suggested: number | null;
  source: DefaultSource | null;
  roundingKg: number;
};

/** The state value a slot's strategy prescribes loads from. */
export function requiredField(params: ProgressionParams): StateField | null {
  switch (params.strategy) {
    case 'LINEAR':
      return 'workingWeight';
    case 'DOUBLE':
      return params.mode === 'REPS' ? null : 'workingWeight';
    case 'PERCENT_TM':
      return 'trainingMax';
    case 'RPE':
      return params.mode === 'RIR_MESOCYCLE' ? 'workingWeight' : 'e1rm';
    case 'NONE':
      if (params.basis === 'WORKING_WEIGHT') return 'workingWeight';
      if (params.basis === 'TRAINING_MAX') return 'trainingMax';
      return null;
  }
}

/**
 * One slot per progression key. When a key is shared, the slot that actually
 * drives progression (a non-NONE strategy) represents the key.
 */
export function collectSlots(snapshot: ProgramSnapshot): EnrollmentSlot[] {
  const byKey = new Map<string, EnrollmentSlot>();
  for (const block of snapshot.blocks) {
    for (const day of block.days) {
      for (const exercise of day.exercises) {
        const params = paramsFor(exercise.strategy, exercise.progression);
        const existing = byKey.get(exercise.progressionKey);
        if (
          !existing ||
          (existing.params.strategy === 'NONE' && params.strategy !== 'NONE')
        ) {
          byKey.set(exercise.progressionKey, {
            progressionKey: exercise.progressionKey,
            exercise,
            params,
          });
        }
      }
    }
  }
  return [...byKey.values()];
}

export function deriveEnrollmentDefaults(
  snapshot: ProgramSnapshot,
  historyByExercise: ReadonlyMap<number, ExerciseHistory>,
): EnrollmentDefault[] {
  return collectSlots(snapshot).map(({ progressionKey, exercise, params }) => {
    const field = requiredField(params);
    const history = historyByExercise.get(exercise.exerciseId);
    const rounding = roundingFor(exercise);
    let suggested: number | null = null;
    let source: DefaultSource | null = null;

    if (field === 'workingWeight' && history?.lastWorkingWeight) {
      suggested = history.lastWorkingWeight;
      source = 'LAST_WORKOUT';
    } else if (field === 'trainingMax' && history?.e1rmRecord) {
      const tmPercent =
        params.strategy === 'PERCENT_TM'
          ? (params.tmPercentOf1RM ?? DEFAULT_TM_PERCENT)
          : DEFAULT_TM_PERCENT;
      suggested = trainingMaxFromE1rm(history.e1rmRecord, tmPercent, rounding);
      source = 'PR_1RM';
    } else if (field === 'e1rm' && history?.e1rmRecord) {
      suggested = Number(history.e1rmRecord.toFixed(2));
      source = 'PR_1RM';
    }

    return {
      progressionKey,
      exerciseId: exercise.exerciseId,
      exerciseName: exercise.exercise.name,
      strategy: params.strategy,
      field,
      suggested,
      source,
      roundingKg: rounding,
    };
  });
}

export type StateInput = {
  exerciseId?: number | null;
  workingWeight?: number | null;
  trainingMax?: number | null;
  e1rm?: number | null;
  roundingKg?: number | null;
};

/**
 * Initial state row for a slot from the enrollment form. A training max is
 * derived from a supplied e1RM when the user gave only that.
 */
export function initialStateForSlot(
  slot: EnrollmentSlot,
  input: StateInput | undefined,
): ExerciseState {
  const rounding = input?.roundingKg ?? roundingFor(slot.exercise);
  let trainingMax = input?.trainingMax ?? null;
  const e1rm = input?.e1rm ?? null;
  if (
    trainingMax === null &&
    e1rm !== null &&
    requiredField(slot.params) === 'trainingMax'
  ) {
    const tmPercent =
      slot.params.strategy === 'PERCENT_TM'
        ? (slot.params.tmPercentOf1RM ?? DEFAULT_TM_PERCENT)
        : DEFAULT_TM_PERCENT;
    trainingMax = trainingMaxFromE1rm(e1rm, tmPercent, rounding);
  }
  return {
    progressionKey: slot.progressionKey,
    exerciseId: input?.exerciseId ?? slot.exercise.exerciseId,
    workingWeight: input?.workingWeight ?? null,
    trainingMax,
    e1rm,
    stageIndex: 0,
    consecutiveFails: 0,
    repsOffset: 0,
    roundingKg: input?.roundingKg ?? null,
  };
}
