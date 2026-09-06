import {
  bestEstimatedOneRepMax,
  estimateOneRepMax,
  trainingMaxFromE1rm,
} from './e1rm';

describe('e1rm helpers', () => {
  it('uses the Epley estimate and returns the load for singles', () => {
    expect(estimateOneRepMax(100, 1)).toBe(100);
    expect(estimateOneRepMax(100, 5)).toBeCloseTo(116.67, 2);
  });

  it('derives a training max at 90 % by default and rounds when asked', () => {
    expect(trainingMaxFromE1rm(120)).toBe(108);
    expect(trainingMaxFromE1rm(120, 85)).toBe(102);
    expect(trainingMaxFromE1rm(116.67, 90, 2.5)).toBe(105);
  });

  it('picks the best completed set and ignores incomplete or empty sets', () => {
    expect(
      bestEstimatedOneRepMax([
        { completed: true, weight: 100, reps: 5 },
        { completed: true, weight: 110, reps: 1 },
        { completed: false, weight: 200, reps: 1 },
        { completed: true, weight: null, reps: 5 },
        { completed: true, weight: 100, reps: 0 },
      ]),
    ).toBeCloseTo(116.67, 2);
    expect(bestEstimatedOneRepMax([])).toBeNull();
  });
});
