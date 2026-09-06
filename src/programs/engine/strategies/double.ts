import { roundToIncrement } from '../rounding';
import { DoubleParams, Strategy } from '../types';
import {
  allPrescribedHit,
  formatKg,
  isWorkingRow,
  loadFromBasis,
  makeEvent,
  maxCompletedWeight,
  renumber,
  resolveWarmups,
  toResolvedSet,
} from './shared';

const DECREMENT_AFTER_FAILS = 2;

/**
 * Double progression: the load stays put until every set reaches the top of
 * the rep range, then it goes up by the increment. In REPS mode (bodyweight)
 * the range itself widens instead of the load.
 */
export const doubleStrategy: Strategy<DoubleParams> = {
  resolve({ exercise, sets, params, state, ctx }) {
    const repsOffset = params.mode === 'REPS' ? state.repsOffset : 0;
    const working = sets.filter(isWorkingRow).map((row) => {
      const baseMax = row.repsMax ?? row.repsMin;
      return toResolvedSet(row, exercise, {
        repsMin: row.repsMin === null ? null : row.repsMin + repsOffset,
        repsMax: baseMax === null ? null : baseMax + repsOffset,
        weight:
          params.mode === 'REPS'
            ? row.weight
            : loadFromBasis(state.workingWeight, row.percent, ctx.rounding),
        basis:
          params.mode === 'REPS'
            ? row.weight !== null
              ? 'FIXED'
              : null
            : 'WORKING_WEIGHT',
      });
    });
    const warmups = resolveWarmups(
      sets,
      exercise,
      state.workingWeight,
      'WORKING_WEIGHT',
      ctx.rounding,
    );
    return renumber([...warmups, ...working]);
  },

  apply({ exercise, params, state, results, ctx }) {
    if (results.length === 0) return { state };

    if (params.mode === 'REPS') {
      if (allPrescribedHit(results, 'MAX')) {
        const step = params.repsStep ?? 1;
        return {
          state: {
            ...state,
            repsOffset: state.repsOffset + step,
            consecutiveFails: 0,
          },
          event: makeEvent(
            exercise,
            state,
            'REPS_INCREMENT',
            state.repsOffset,
            state.repsOffset + step,
            `Rep range moves up by ${step}`,
          ),
        };
      }
      return { state: { ...state, consecutiveFails: 0 } };
    }

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

    if (allPrescribedHit(results, 'MAX')) {
      const to = roundToIncrement(
        state.workingWeight + params.incrementKg,
        ctx.rounding,
      );
      return {
        state: { ...state, workingWeight: to, consecutiveFails: 0 },
        event: makeEvent(
          exercise,
          state,
          'INCREMENT',
          state.workingWeight,
          to,
          `${formatKg(state.workingWeight)} → ${formatKg(to)}`,
        ),
      };
    }

    const belowRange = results.some(
      (result) =>
        !result.completed ||
        (result.prescribed.repsMin !== null &&
          (result.reps ?? 0) < result.prescribed.repsMin),
    );
    if (!belowRange) {
      return {
        state: { ...state, consecutiveFails: 0 },
        event: makeEvent(
          exercise,
          state,
          'HOLD',
          state.workingWeight,
          state.workingWeight,
          `In range — keep ${formatKg(state.workingWeight)} and add reps`,
        ),
      };
    }

    const fails = state.consecutiveFails + 1;
    if (fails < DECREMENT_AFTER_FAILS) {
      return {
        state: { ...state, consecutiveFails: fails },
        event: makeEvent(
          exercise,
          state,
          'FAIL',
          state.workingWeight,
          state.workingWeight,
          `Below the rep range — same weight next time`,
        ),
      };
    }
    const to = Math.max(
      0,
      roundToIncrement(state.workingWeight - params.incrementKg, ctx.rounding),
    );
    return {
      state: { ...state, workingWeight: to, consecutiveFails: 0 },
      event: makeEvent(
        exercise,
        state,
        'DECREMENT',
        state.workingWeight,
        to,
        `Below the rep range twice — dropping to ${formatKg(to)}`,
      ),
    };
  },
};
