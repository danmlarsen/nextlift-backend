import { ProgressionParams, ProgressionStrategyName, Strategy } from '../types';
import { doubleStrategy } from './double';
import { linearStrategy } from './linear';
import { noneStrategy } from './none';
import { percentTmStrategy } from './percent-tm';
import { rpeStrategy } from './rpe';

const STRATEGIES: Record<
  ProgressionStrategyName,
  Strategy<ProgressionParams>
> = {
  NONE: noneStrategy,
  LINEAR: linearStrategy,
  DOUBLE: doubleStrategy,
  PERCENT_TM: percentTmStrategy,
  RPE: rpeStrategy,
};

export function getStrategy(
  name: ProgressionStrategyName,
): Strategy<ProgressionParams> {
  return STRATEGIES[name] ?? noneStrategy;
}

/** Params used when a slot has none stored (only meaningful for NONE). */
export function paramsFor(
  name: ProgressionStrategyName,
  stored: ProgressionParams | null,
): ProgressionParams {
  if (stored && stored.strategy === name) return stored;
  return { strategy: 'NONE' };
}
