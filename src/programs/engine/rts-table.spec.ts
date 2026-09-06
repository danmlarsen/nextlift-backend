import {
  estimateOneRepMaxFromRpe,
  isValidRpe,
  loadForRpe,
  percentOfOneRepMax,
  rirFromRpe,
  rpeFromRir,
  RPE_VALUES,
} from './rts-table';

describe('rts-table', () => {
  it('exposes the 6-10 scale in half steps', () => {
    expect(RPE_VALUES).toEqual([6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]);
    expect(isValidRpe(8.5)).toBe(true);
    expect(isValidRpe(8.25)).toBe(false);
    expect(isValidRpe(11)).toBe(false);
  });

  it('converts between RPE and RIR', () => {
    expect(rirFromRpe(8)).toBe(2);
    expect(rirFromRpe(9.5)).toBe(0.5);
    expect(rpeFromRir(3)).toBe(7);
  });

  it.each([
    [1, 10, 100],
    [1, 9, 95.5],
    [1, 8, 92.2],
    [5, 10, 86.3],
    [5, 8, 81.1],
    [8, 7, 70.7],
    [3, 9, 89.2],
    [10, 10, 73.9],
  ])('%s reps @ RPE %s = %s %% of 1RM', (reps, rpe, expected) => {
    expect(percentOfOneRepMax(reps, rpe)).toBe(expected);
  });

  it('interpolates half-point RPEs', () => {
    // 5 @ 8.5 sits between 5 @ 9 (83.7) and 5 @ 8 (81.1).
    expect(percentOfOneRepMax(5, 8.5)).toBe(82.4);
  });

  it('extrapolates beyond the table and never drops below the floor', () => {
    expect(percentOfOneRepMax(16, 10)).toBe(57.4);
    expect(percentOfOneRepMax(17, 10)).toBe(54.9);
    expect(percentOfOneRepMax(40, 10)).toBe(30);
  });

  it('clamps out-of-range inputs', () => {
    expect(percentOfOneRepMax(0, 10)).toBe(100);
    expect(percentOfOneRepMax(1, 12)).toBe(100);
    expect(percentOfOneRepMax(1, 6)).toBe(86.3);
  });

  it('round-trips load and estimated 1RM', () => {
    const e1rm = 120;
    const load = loadForRpe(e1rm, 5, 8);
    expect(load).toBeCloseTo(97.32, 2);
    expect(estimateOneRepMaxFromRpe(load, 5, 8)).toBeCloseTo(e1rm, 6);
  });
});
