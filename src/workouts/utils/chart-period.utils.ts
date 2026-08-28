import {
  eachDayOfInterval,
  eachMonthOfInterval,
  eachWeekOfInterval,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from 'date-fns';

export enum ChartRange {
  THIRTY_DAYS = '30d',
  TWELVE_WEEKS = '12w',
  SIX_MONTHS = '6m',
}

export type ChartGranularity = 'daily' | 'weekly' | 'monthly';

export const CHART_RANGE_GRANULARITY: Record<ChartRange, ChartGranularity> = {
  [ChartRange.THIRTY_DAYS]: 'daily',
  [ChartRange.TWELVE_WEEKS]: 'weekly',
  [ChartRange.SIX_MONTHS]: 'monthly',
};

export const CHART_GRANULARITY_SQL_UNIT: Record<ChartGranularity, string> = {
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
};

export interface ChartPoint {
  period: string;
  workouts: number;
  totalVolume: number;
}

const PERIOD_KEY_FORMAT = 'yyyy-MM-dd';

/**
 * Start of the first bucket for a range, so the range always spans a fixed
 * number of complete buckets ending with the current one:
 * 30d -> 30 days, 12w -> 12 ISO weeks (Monday start), 6m -> 6 months.
 */
export function getChartRangeStart(range: ChartRange, now: Date): Date {
  switch (range) {
    case ChartRange.THIRTY_DAYS:
      return startOfDay(subDays(now, 29));
    case ChartRange.TWELVE_WEEKS:
      return startOfWeek(subWeeks(now, 11), { weekStartsOn: 1 });
    case ChartRange.SIX_MONTHS:
      return startOfMonth(subMonths(now, 5));
  }
}

/**
 * Every bucket-start key in [from, to], formatted yyyy-MM-dd
 * (weekly buckets are keyed by their Monday, monthly by the 1st).
 */
export function buildChartPeriodKeys(
  granularity: ChartGranularity,
  from: Date,
  to: Date,
): string[] {
  const interval = { start: from, end: to };
  const bucketStarts =
    granularity === 'daily'
      ? eachDayOfInterval(interval)
      : granularity === 'weekly'
        ? eachWeekOfInterval(interval, { weekStartsOn: 1 })
        : eachMonthOfInterval(interval);

  return bucketStarts.map((date) => format(date, PERIOD_KEY_FORMAT));
}

/**
 * Expands sparse per-bucket aggregates into a continuous series over
 * [from, to], filling buckets without data with zeros.
 */
export function zeroFillChartPoints(
  granularity: ChartGranularity,
  from: Date,
  to: Date,
  dataByPeriod: Map<string, { workouts: number; totalVolume: number }>,
): ChartPoint[] {
  return buildChartPeriodKeys(granularity, from, to).map((period) => {
    const entry = dataByPeriod.get(period);
    return {
      period,
      workouts: entry?.workouts ?? 0,
      totalVolume: entry?.totalVolume ?? 0,
    };
  });
}
