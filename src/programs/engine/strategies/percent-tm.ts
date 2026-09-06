import { bestEstimatedOneRepMax, DEFAULT_TM_PERCENT } from '../e1rm';
import { roundToIncrement } from '../rounding';
import { PercentTmParams, Strategy } from '../types';
import {
  amrapResult,
  formatKg,
  isWorkingRow,
  loadFromBasis,
  makeEvent,
  renumber,
  resolveWarmups,
  toResolvedSet,
} from './shared';

/**
 * Percentage-of-training-max programs (5/3/1, nSuns, peaking blocks). Rows
 * carry the percentages, optionally per week-in-block; the training max moves
 * at the end of a cycle or per session according to the AMRAP rule.
 */
export const percentTmStrategy: Strategy<PercentTmParams> = {
  resolve({ exercise, sets, state, ctx }) {
    const working = sets.filter(isWorkingRow).map((row) =>
      toResolvedSet(row, exercise, {
        weight: loadFromBasis(state.trainingMax, row.percent, ctx.rounding),
        basis: 'TRAINING_MAX',
      }),
    );
    const warmups = resolveWarmups(
      sets,
      exercise,
      state.trainingMax,
      'TRAINING_MAX',
      ctx.rounding,
    );
    return renumber([...warmups, ...working]);
  },

  apply({ exercise, params, state, results, ctx }) {
    if (results.length === 0) return { state };

    if (state.trainingMax === null) {
      const e1rm = bestEstimatedOneRepMax(results);
      if (e1rm === null) return { state };
      const trainingMax = roundToIncrement(
        (e1rm * (params.tmPercentOf1RM ?? DEFAULT_TM_PERCENT)) / 100,
        ctx.rounding,
      );
      return {
        state: { ...state, trainingMax, e1rm },
        event: makeEvent(
          exercise,
          state,
          'SEED',
          null,
          trainingMax,
          `Training max set to ${formatKg(trainingMax)}`,
        ),
      };
    }

    if ((params.tmAdvance ?? 'CYCLE_END') !== 'AMRAP') return { state };

    const amrap = amrapResult(results);
    if (!amrap || !amrap.completed) return { state };
    const reps = amrap.reps ?? 0;
    const rule = (params.amrapTmRule ?? []).find(
      (candidate) =>
        reps >= candidate.minReps &&
        (candidate.maxReps === null || reps <= candidate.maxReps),
    );
    if (!rule || rule.incrementKg === 0) {
      return {
        state,
        event: makeEvent(
          exercise,
          state,
          'HOLD',
          state.trainingMax,
          state.trainingMax,
          `${reps} reps on the top set — training max stays at ${formatKg(state.trainingMax)}`,
        ),
      };
    }
    const to = roundToIncrement(
      state.trainingMax + rule.incrementKg,
      ctx.rounding,
    );
    return {
      state: { ...state, trainingMax: to },
      event: makeEvent(
        exercise,
        state,
        'TM_INCREMENT',
        state.trainingMax,
        to,
        `${reps} reps on the top set — training max ${formatKg(state.trainingMax)} → ${formatKg(to)}`,
      ),
    };
  },

  onCycleEnd({ exercise, params, state, rounding }) {
    if ((params.tmAdvance ?? 'CYCLE_END') !== 'CYCLE_END') return { state };
    if (state.trainingMax === null) return { state };
    const to = roundToIncrement(
      state.trainingMax + params.tmIncrementKg,
      rounding,
    );
    return {
      state: { ...state, trainingMax: to },
      event: makeEvent(
        exercise,
        state,
        'TM_INCREMENT',
        state.trainingMax,
        to,
        `New cycle — training max ${formatKg(state.trainingMax)} → ${formatKg(to)}`,
      ),
    };
  },
};
