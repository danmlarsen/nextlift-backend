import {
  buildChartPeriodKeys,
  ChartRange,
  getChartRangeStart,
  zeroFillChartPoints,
} from './chart-period.utils';

describe('chart-period.utils', () => {
  describe('getChartRangeStart', () => {
    it('returns the start of the day 29 days back for 30d', () => {
      const now = new Date(2026, 7, 28, 14, 30); // Aug 28 2026
      expect(getChartRangeStart(ChartRange.THIRTY_DAYS, now)).toEqual(
        new Date(2026, 6, 30), // Jul 30 00:00
      );
    });

    it('returns the Monday of the week 11 weeks back for 12w', () => {
      const now = new Date(2026, 7, 28); // Aug 28 2026 (Friday)
      const start = getChartRangeStart(ChartRange.TWELVE_WEEKS, now);
      expect(start.getDay()).toBe(1); // Monday
      expect(start).toEqual(new Date(2026, 5, 8)); // Jun 8 2026
    });

    it('returns the first of the month 5 months back for 6m', () => {
      const now = new Date(2026, 7, 28);
      expect(getChartRangeStart(ChartRange.SIX_MONTHS, now)).toEqual(
        new Date(2026, 2, 1), // Mar 1 2026
      );
    });
  });

  describe('buildChartPeriodKeys', () => {
    it('builds continuous daily keys across a month boundary', () => {
      const keys = buildChartPeriodKeys(
        'daily',
        new Date(2026, 6, 30),
        new Date(2026, 7, 2),
      );
      expect(keys).toEqual([
        '2026-07-30',
        '2026-07-31',
        '2026-08-01',
        '2026-08-02',
      ]);
    });

    it('builds Monday-keyed weekly buckets across a year boundary', () => {
      const keys = buildChartPeriodKeys(
        'weekly',
        new Date(2025, 11, 22), // Mon Dec 22 2025
        new Date(2026, 0, 6),
      );
      expect(keys).toEqual(['2025-12-22', '2025-12-29', '2026-01-05']);
    });

    it('builds monthly keys across a year boundary', () => {
      const keys = buildChartPeriodKeys(
        'monthly',
        new Date(2025, 10, 1),
        new Date(2026, 1, 15),
      );
      expect(keys).toEqual([
        '2025-11-01',
        '2025-12-01',
        '2026-01-01',
        '2026-02-01',
      ]);
    });

    it('spans exactly 30 daily buckets for the 30d range start', () => {
      const now = new Date(2026, 7, 28, 10);
      const from = getChartRangeStart(ChartRange.THIRTY_DAYS, now);
      expect(buildChartPeriodKeys('daily', from, now)).toHaveLength(30);
    });

    it('spans exactly 12 weekly buckets for the 12w range start', () => {
      const now = new Date(2026, 7, 28);
      const from = getChartRangeStart(ChartRange.TWELVE_WEEKS, now);
      expect(buildChartPeriodKeys('weekly', from, now)).toHaveLength(12);
    });

    it('spans exactly 6 monthly buckets for the 6m range start', () => {
      const now = new Date(2026, 7, 28);
      const from = getChartRangeStart(ChartRange.SIX_MONTHS, now);
      expect(buildChartPeriodKeys('monthly', from, now)).toHaveLength(6);
    });
  });

  describe('zeroFillChartPoints', () => {
    it('fills buckets without data with zeros and keeps existing values', () => {
      const points = zeroFillChartPoints(
        'weekly',
        new Date(2026, 7, 3), // Mon Aug 3
        new Date(2026, 7, 21),
        new Map([['2026-08-10', { workouts: 3, totalVolume: 1250.5 }]]),
      );
      expect(points).toEqual([
        { period: '2026-08-03', workouts: 0, totalVolume: 0 },
        { period: '2026-08-10', workouts: 3, totalVolume: 1250.5 },
        { period: '2026-08-17', workouts: 0, totalVolume: 0 },
      ]);
    });

    it('returns an all-zero series of full length when there is no data', () => {
      const points = zeroFillChartPoints(
        'daily',
        new Date(2026, 7, 1),
        new Date(2026, 7, 5),
        new Map(),
      );
      expect(points).toHaveLength(5);
      expect(points.every((p) => p.workouts === 0 && p.totalVolume === 0)).toBe(
        true,
      );
    });
  });
});
