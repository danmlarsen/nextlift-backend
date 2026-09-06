import { roundLoad, roundToIncrement } from './rounding';

describe('roundToIncrement', () => {
  it.each([
    [61.2, 2.5, 60],
    [61.3, 2.5, 62.5],
    [63.74, 2.5, 62.5],
    [63.75, 2.5, 65],
    [55.25, 2.5, 55],
    [41, 2, 42],
    [41, 5, 40],
    [43, 5, 45],
    [20.6, 1.25, 20],
    [21.3, 1.25, 21.25],
  ])('rounds %s to the nearest %s -> %s', (value, increment, expected) => {
    expect(roundToIncrement(value, increment)).toBe(expected);
  });

  it('defaults to 2.5 kg and trims floating point noise', () => {
    expect(roundToIncrement(0.1 + 0.2 + 62.2)).toBe(62.5);
    expect(roundToIncrement(100)).toBe(100);
  });

  it('leaves the value alone for a non-positive increment', () => {
    expect(roundToIncrement(61.234, 0)).toBe(61.234);
    expect(roundToIncrement(61.234, -1)).toBe(61.234);
  });
});

describe('roundLoad', () => {
  it('passes null through and rounds numbers', () => {
    expect(roundLoad(null, 2.5)).toBeNull();
    expect(roundLoad(undefined, 2.5)).toBeNull();
    expect(roundLoad(81.1, 2.5)).toBe(80);
  });
});
