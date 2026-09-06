import { calculateOneRepMax } from 'src/common/utils';
import { roundToIncrement } from './rounding';

export const DEFAULT_TM_PERCENT = 90;

/** Epley estimate shared with the rest of the app; singles return the load. */
export function estimateOneRepMax(weight: number, reps: number): number {
  return calculateOneRepMax(weight, reps);
}

/** Training max used by percentage programs: a fraction of the estimated 1RM. */
export function trainingMaxFromE1rm(
  e1rm: number,
  tmPercent: number = DEFAULT_TM_PERCENT,
  rounding?: number,
): number {
  const trainingMax = (e1rm * tmPercent) / 100;
  return rounding ? roundToIncrement(trainingMax, rounding) : trainingMax;
}

/**
 * Best estimated 1RM among completed sets with a positive load and rep count.
 * Returns null when nothing qualifies.
 */
export function bestEstimatedOneRepMax(
  sets: { completed: boolean; weight: number | null; reps: number | null }[],
): number | null {
  let best: number | null = null;
  for (const set of sets) {
    if (!set.completed || !set.weight || !set.reps) continue;
    if (set.weight <= 0 || set.reps <= 0) continue;
    const estimate = estimateOneRepMax(set.weight, set.reps);
    if (best === null || estimate > best) best = estimate;
  }
  return best;
}
