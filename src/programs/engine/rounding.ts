export const DEFAULT_ROUNDING_KG = 2.5;

/**
 * Rounds a load to the nearest multiple of the increment (2.5 kg plates by
 * default). Floating point noise is trimmed so 62.5 never becomes 62.50000001.
 */
export function roundToIncrement(
  value: number,
  increment: number = DEFAULT_ROUNDING_KG,
): number {
  if (!Number.isFinite(value)) return value;
  if (!Number.isFinite(increment) || increment <= 0) {
    return Number(value.toFixed(3));
  }
  const rounded = Math.round(value / increment) * increment;
  return Number(rounded.toFixed(3));
}

/** Rounds a nullable load; null stays null (no basis known yet). */
export function roundLoad(
  value: number | null | undefined,
  increment: number,
): number | null {
  if (value === null || value === undefined) return null;
  return roundToIncrement(value, increment);
}
