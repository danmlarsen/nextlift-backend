import { NoneParams, Strategy } from '../types';
import {
  isWorkingRow,
  loadFromBasis,
  renumber,
  resolveWarmups,
  toResolvedSet,
} from './shared';

/**
 * Prescribes targets without ever changing state. Loads come from a fixed
 * weight on the row, or from the shared key's working weight / training max
 * (e.g. 5/3/1 supplemental sets that follow the main lift's training max).
 */
export const noneStrategy: Strategy<NoneParams> = {
  resolve({ exercise, sets, params, state, ctx }) {
    const working = sets.filter(isWorkingRow);
    const basis =
      params.basis ??
      (working.some((row) => row.weight !== null)
        ? 'FIXED'
        : working.some((row) => row.percent !== null)
          ? 'WORKING_WEIGHT'
          : null);

    const basisValue =
      basis === 'WORKING_WEIGHT'
        ? state.workingWeight
        : basis === 'TRAINING_MAX'
          ? state.trainingMax
          : null;

    const resolvedWorking = working.map((row) =>
      toResolvedSet(row, exercise, {
        weight:
          basis === 'FIXED'
            ? row.weight
            : basis
              ? loadFromBasis(basisValue, row.percent, ctx.rounding)
              : null,
        basis,
      }),
    );
    const warmups = resolveWarmups(
      sets,
      exercise,
      basisValue,
      basis === 'TRAINING_MAX' ? 'TRAINING_MAX' : 'WORKING_WEIGHT',
      ctx.rounding,
    );
    return renumber([...warmups, ...resolvedWorking]);
  },

  apply({ state }) {
    return { state };
  },
};
