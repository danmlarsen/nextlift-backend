import { roundToIncrement } from '../rounding';
import { LinearParams, ResolvedSet, Strategy } from '../types';
import {
  allPrescribedHit,
  amrapResult,
  formatKg,
  isWorkingRow,
  loadFromBasis,
  makeEvent,
  maxCompletedWeight,
  renumber,
  resolveWarmups,
  toResolvedSet,
} from './shared';

const DEFAULT_FAIL_THRESHOLD = 3;
const DEFAULT_DELOAD_PERCENT = 10;
const DEFAULT_STAGE_RESET_PERCENT = 85;

/**
 * Session-to-session linear progression: hit every prescribed set and the
 * working weight goes up by the increment. Repeated failures either move to
 * the next set x rep stage at the same load (GZCLP) or take a percentage off.
 * With `amrapRepsThreshold` the only test is the AMRAP set (GZCLP T3).
 */
export const linearStrategy: Strategy<LinearParams> = {
  resolve({ exercise, sets, params, state, ctx }) {
    const working = sets.filter(isWorkingRow);
    const stages = params.stages ?? [];
    const stage = stages[Math.min(state.stageIndex, stages.length - 1)];

    let resolvedWorking: ResolvedSet[];
    if (stage && working.length > 0) {
      const template = working[0];
      resolvedWorking = Array.from({ length: stage.sets }, (_, index) =>
        toResolvedSet(template, exercise, {
          repsMin: stage.reps,
          repsMax: stage.reps,
          isAmrap: !!stage.amrapLast && index === stage.sets - 1,
          weight: loadFromBasis(
            state.workingWeight,
            template.percent,
            ctx.rounding,
          ),
          basis: 'WORKING_WEIGHT',
        }),
      );
    } else {
      resolvedWorking = working.map((row) =>
        toResolvedSet(row, exercise, {
          weight: loadFromBasis(state.workingWeight, row.percent, ctx.rounding),
          basis: 'WORKING_WEIGHT',
        }),
      );
    }

    const warmups = resolveWarmups(
      sets,
      exercise,
      state.workingWeight,
      'WORKING_WEIGHT',
      ctx.rounding,
    );
    return renumber([...warmups, ...resolvedWorking]);
  },

  apply({ exercise, params, state, results, ctx }) {
    if (results.length === 0) return { state };

    if (state.workingWeight === null) {
      const seed = maxCompletedWeight(results);
      if (seed === null) return { state };
      const workingWeight = roundToIncrement(seed, ctx.rounding);
      return {
        state: { ...state, workingWeight, consecutiveFails: 0 },
        event: makeEvent(
          exercise,
          state,
          'SEED',
          null,
          workingWeight,
          `Starting weight set to ${formatKg(workingWeight)}`,
        ),
      };
    }

    const increment = (from: number) => {
      const to = roundToIncrement(from + params.incrementKg, ctx.rounding);
      return {
        state: { ...state, workingWeight: to, consecutiveFails: 0 },
        event: makeEvent(
          exercise,
          state,
          'INCREMENT',
          from,
          to,
          `${formatKg(from)} → ${formatKg(to)}`,
        ),
      };
    };

    if (params.amrapRepsThreshold !== undefined) {
      const amrap = amrapResult(results);
      const reached =
        !!amrap &&
        amrap.completed &&
        (amrap.reps ?? 0) >= params.amrapRepsThreshold &&
        allPrescribedHit(results, 'MIN');
      if (reached) return increment(state.workingWeight);
      return {
        state,
        event: makeEvent(
          exercise,
          state,
          'HOLD',
          state.workingWeight,
          state.workingWeight,
          `Keep ${formatKg(state.workingWeight)} until the last set reaches ${params.amrapRepsThreshold} reps`,
        ),
      };
    }

    if (allPrescribedHit(results, 'MIN')) return increment(state.workingWeight);

    const threshold = params.failThreshold ?? DEFAULT_FAIL_THRESHOLD;
    const fails = state.consecutiveFails + 1;
    if (fails < threshold) {
      return {
        state: { ...state, consecutiveFails: fails },
        event: makeEvent(
          exercise,
          state,
          'FAIL',
          state.workingWeight,
          state.workingWeight,
          `Missed reps (${fails} of ${threshold}) — same weight next time`,
        ),
      };
    }

    const stages = params.stages ?? [];
    if (stages.length > 0 && state.stageIndex < stages.length - 1) {
      const next = stages[state.stageIndex + 1];
      return {
        state: {
          ...state,
          stageIndex: state.stageIndex + 1,
          consecutiveFails: 0,
        },
        event: makeEvent(
          exercise,
          state,
          'STAGE_ADVANCE',
          state.stageIndex,
          state.stageIndex + 1,
          `Switching to ${next.sets}×${next.reps}${next.amrapLast ? '+' : ''} at ${formatKg(state.workingWeight)}`,
        ),
      };
    }

    const keepPercent =
      stages.length > 0
        ? (params.stageResetPercent ?? DEFAULT_STAGE_RESET_PERCENT)
        : 100 - (params.deloadPercent ?? DEFAULT_DELOAD_PERCENT);
    const to = roundToIncrement(
      (state.workingWeight * keepPercent) / 100,
      ctx.rounding,
    );
    return {
      state: {
        ...state,
        workingWeight: to,
        stageIndex: 0,
        consecutiveFails: 0,
      },
      event: makeEvent(
        exercise,
        state,
        'RESET',
        state.workingWeight,
        to,
        `Resetting to ${formatKg(to)} (${keepPercent} %) and building back up`,
      ),
    };
  },
};
