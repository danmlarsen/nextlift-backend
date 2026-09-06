/**
 * RTS-style RPE table (Tuchscherer; Zourdos/Helms 2016). The percentage of
 * 1RM a set represents depends only on how many reps could have been done in
 * total: the reps performed plus the reps in reserve (10 - RPE). One array
 * therefore covers every reps x RPE combination.
 */
export const PCT_BY_TOTAL_REPS = [
  100, 95.5, 92.2, 89.2, 86.3, 83.7, 81.1, 78.6, 76.2, 73.9, 70.7, 68.0, 65.3,
  62.6, 59.9, 57.4,
] as const;

/** Percent drop per additional rep beyond the table. */
const EXTRAPOLATION_STEP = 2.5;
const MIN_PERCENT = 30;

export const RPE_MIN = 6;
export const RPE_MAX = 10;
export const RPE_STEP = 0.5;

export const RPE_VALUES: readonly number[] = Array.from(
  { length: (RPE_MAX - RPE_MIN) / RPE_STEP + 1 },
  (_, index) => RPE_MIN + index * RPE_STEP,
);

export function isValidRpe(value: number): boolean {
  return RPE_VALUES.includes(value);
}

/** RIR is the mirror image of RPE on the 10-point scale. */
export function rirFromRpe(rpe: number): number {
  return Number((10 - rpe).toFixed(1));
}

export function rpeFromRir(rir: number): number {
  return Number((10 - rir).toFixed(1));
}

function percentForTotalReps(totalReps: number): number {
  if (totalReps <= 1) return PCT_BY_TOTAL_REPS[0];
  const lastIndex = PCT_BY_TOTAL_REPS.length - 1;
  const index = totalReps - 1;
  if (index <= lastIndex) {
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return PCT_BY_TOTAL_REPS[lower];
    // Half-point RPEs land between two rows: interpolate.
    const fraction = index - lower;
    return (
      PCT_BY_TOTAL_REPS[lower] +
      (PCT_BY_TOTAL_REPS[upper] - PCT_BY_TOTAL_REPS[lower]) * fraction
    );
  }
  const beyond = index - lastIndex;
  return Math.max(
    MIN_PERCENT,
    PCT_BY_TOTAL_REPS[lastIndex] - beyond * EXTRAPOLATION_STEP,
  );
}

/**
 * Percentage of 1RM for `reps` performed at the given RPE. RPE is clamped to
 * the 6-10 scale; reps below 1 are treated as a single.
 */
export function percentOfOneRepMax(reps: number, rpe: number): number {
  const clampedRpe = Math.min(RPE_MAX, Math.max(RPE_MIN, rpe));
  const totalReps = Math.max(1, reps) + (RPE_MAX - clampedRpe);
  return Number(percentForTotalReps(totalReps).toFixed(2));
}

/** The load that should feel like `rpe` for `reps`, given an estimated 1RM. */
export function loadForRpe(e1rm: number, reps: number, rpe: number): number {
  return (e1rm * percentOfOneRepMax(reps, rpe)) / 100;
}

/** Estimated 1RM implied by a set logged with an RPE. */
export function estimateOneRepMaxFromRpe(
  weight: number,
  reps: number,
  rpe: number,
): number {
  return (weight * 100) / percentOfOneRepMax(reps, rpe);
}
