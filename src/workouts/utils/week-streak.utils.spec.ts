import { countWeekStreak } from './week-streak.utils';

describe('countWeekStreak', () => {
  it('counts a consecutive run ending at the displayed week', () => {
    expect(countWeekStreak([0, -1, -2], { isCurrentWeek: false })).toBe(3);
  });

  it('stops counting at a gap', () => {
    expect(countWeekStreak([0, -1, -3, -4], { isCurrentWeek: false })).toBe(2);
  });

  it('returns 0 for empty input', () => {
    expect(countWeekStreak([], { isCurrentWeek: false })).toBe(0);
    expect(countWeekStreak([], { isCurrentWeek: true })).toBe(0);
  });

  it('returns 0 for a past week without workouts, even with earlier activity', () => {
    expect(countWeekStreak([-1, -2], { isCurrentWeek: false })).toBe(0);
  });

  it('continues the streak from the previous week when the current week has no workouts yet', () => {
    expect(countWeekStreak([-1, -2], { isCurrentWeek: true })).toBe(2);
  });

  it('includes the current week when it has workouts', () => {
    expect(countWeekStreak([0, -1], { isCurrentWeek: true })).toBe(2);
  });

  it('ignores positive offsets', () => {
    expect(countWeekStreak([1, 0, -1], { isCurrentWeek: false })).toBe(2);
  });

  it('handles unordered input', () => {
    expect(countWeekStreak([-2, 0, -1], { isCurrentWeek: false })).toBe(3);
  });
});
