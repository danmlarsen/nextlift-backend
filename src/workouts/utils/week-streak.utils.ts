/**
 * Counts consecutive weeks with at least one workout, walking backwards
 * from the displayed week.
 *
 * @param weekOffsets Distinct integer week offsets relative to the displayed
 * week start (0 = displayed week, -1 = previous week, ...). Positive offsets
 * are ignored.
 * @param opts.isCurrentWeek When the displayed week is the in-progress week,
 * a missing offset 0 does not break the streak yet — counting continues
 * from the previous week.
 */
export function countWeekStreak(
  weekOffsets: number[],
  opts: { isCurrentWeek: boolean },
): number {
  const offsets = new Set(weekOffsets);

  let cursor = 0;
  if (!offsets.has(0)) {
    if (!opts.isCurrentWeek) {
      return 0;
    }
    cursor = -1;
  }

  let streak = 0;
  while (offsets.has(cursor)) {
    streak++;
    cursor--;
  }
  return streak;
}
