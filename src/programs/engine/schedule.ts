import {
  addDays,
  differenceInCalendarDays,
  format,
  getISODay,
  parseISO,
  startOfWeek,
} from 'date-fns';
import {
  Position,
  ProgramSnapshot,
  SnapshotBlock,
  SnapshotDay,
  WeekLocation,
} from './types';

const MONDAY = { weekStartsOn: 1 as const };
const DATE_FORMAT = 'yyyy-MM-dd';

/** Total weeks in one cycle of the program. */
export function totalWeeks(snapshot: ProgramSnapshot): number {
  return snapshot.blocks.reduce((sum, block) => sum + block.weeks.length, 0);
}

/** Resolves a cycle-wide week index to its block and week-in-block. */
export function locateWeek(
  snapshot: ProgramSnapshot,
  weekIndex: number,
): WeekLocation | null {
  if (!Number.isInteger(weekIndex) || weekIndex < 1) return null;
  let offset = 0;
  for (let blockIndex = 0; blockIndex < snapshot.blocks.length; blockIndex++) {
    const block = snapshot.blocks[blockIndex];
    const count = block.weeks.length;
    if (weekIndex <= offset + count) {
      const weekInBlock = weekIndex - offset;
      const week = block.weeks.find((w) => w.weekInBlock === weekInBlock);
      if (!week) return null;
      return { blockIndex, weekInBlock, block, week };
    }
    offset += count;
  }
  return null;
}

export function findDay(
  snapshot: ProgramSnapshot,
  position: Position,
): { location: WeekLocation; day: SnapshotDay } | null {
  const location = locateWeek(snapshot, position.weekIndex);
  if (!location) return null;
  const days = sortedDays(location.block);
  const day = days[position.dayIndex - 1];
  if (!day) return null;
  return { location, day };
}

export function sortedDays(block: SnapshotBlock): SnapshotDay[] {
  return [...block.days].sort((a, b) => a.dayOrder - b.dayOrder);
}

export function firstPosition(cycle = 1): Position {
  return { cycle, weekIndex: 1, dayIndex: 1 };
}

/**
 * The position after `position`: next day in the block, then the next week's
 * first day, then (open-ended programs only) the next cycle. `null` means a
 * fixed-length program has been completed.
 */
export function nextPosition(
  snapshot: ProgramSnapshot,
  position: Position,
): Position | null {
  const location = locateWeek(snapshot, position.weekIndex);
  if (!location) return null;
  if (position.dayIndex < location.block.days.length) {
    return { ...position, dayIndex: position.dayIndex + 1 };
  }
  if (position.weekIndex < totalWeeks(snapshot)) {
    return {
      cycle: position.cycle,
      weekIndex: position.weekIndex + 1,
      dayIndex: 1,
    };
  }
  if (snapshot.durationMode === 'OPEN_ENDED') {
    return firstPosition(position.cycle + 1);
  }
  return null;
}

export function comparePositions(a: Position, b: Position): number {
  if (a.cycle !== b.cycle) return a.cycle - b.cycle;
  if (a.weekIndex !== b.weekIndex) return a.weekIndex - b.weekIndex;
  return a.dayIndex - b.dayIndex;
}

export function samePosition(a: Position, b: Position): boolean {
  return comparePositions(a, b) === 0;
}

/**
 * Positions strictly between `from` and `to`, walking forward. Used to mark
 * passed-over days as skipped when the user jumps ahead. Bounded so a corrupt
 * snapshot can never loop forever.
 */
export function positionsBetween(
  snapshot: ProgramSnapshot,
  from: Position,
  to: Position,
  limit = 1000,
): Position[] {
  const between: Position[] = [];
  let cursor = nextPosition(snapshot, from);
  while (cursor && comparePositions(cursor, to) < 0 && between.length < limit) {
    between.push(cursor);
    cursor = nextPosition(snapshot, cursor);
  }
  return between;
}

export function isValidPosition(
  snapshot: ProgramSnapshot,
  position: Position,
): boolean {
  if (!Number.isInteger(position.cycle) || position.cycle < 1) return false;
  if (position.cycle > 1 && snapshot.durationMode !== 'OPEN_ENDED')
    return false;
  return findDay(snapshot, position) !== null;
}

// --- Calendar mode -----------------------------------------------------------

/** Monday of the week that contains the given ISO date (yyyy-MM-dd). */
export function mondayOf(date: string): string {
  return format(startOfWeek(parseISO(date), MONDAY), DATE_FORMAT);
}

export type WeekdayMap = Record<string, number> | null | undefined;

export function weekdayForDay(
  day: SnapshotDay,
  weekdayMap: WeekdayMap,
): number | null {
  const override = weekdayMap?.[String(day.id)];
  return override ?? day.weekday;
}

/** Cycle and week that contain `localDate`, or null outside the program. */
export function weekForDate(
  snapshot: ProgramSnapshot,
  startDate: string,
  localDate: string,
): { cycle: number; weekIndex: number } | null {
  const total = totalWeeks(snapshot);
  if (total === 0) return null;
  const start = startOfWeek(parseISO(startDate), MONDAY);
  const elapsedDays = differenceInCalendarDays(parseISO(localDate), start);
  if (elapsedDays < 0) return null;
  const weeksElapsed = Math.floor(elapsedDays / 7);
  if (weeksElapsed < total) return { cycle: 1, weekIndex: weeksElapsed + 1 };
  if (snapshot.durationMode !== 'OPEN_ENDED') return null;
  return {
    cycle: Math.floor(weeksElapsed / total) + 1,
    weekIndex: (weeksElapsed % total) + 1,
  };
}

/**
 * The program day pinned to `localDate` in a CALENDAR program, or null when
 * the date is a rest day or lies outside the program.
 */
export function positionForDate(
  snapshot: ProgramSnapshot,
  startDate: string,
  localDate: string,
  weekdayMap?: WeekdayMap,
): { position: Position; day: SnapshotDay; location: WeekLocation } | null {
  const week = weekForDate(snapshot, startDate, localDate);
  if (!week) return null;
  const location = locateWeek(snapshot, week.weekIndex);
  if (!location) return null;
  const weekday = getISODay(parseISO(localDate));
  const days = sortedDays(location.block);
  const dayIndex = days.findIndex(
    (day) => weekdayForDay(day, weekdayMap) === weekday,
  );
  if (dayIndex < 0) return null;
  return {
    position: {
      cycle: week.cycle,
      weekIndex: week.weekIndex,
      dayIndex: dayIndex + 1,
    },
    day: days[dayIndex],
    location,
  };
}

/** Calendar date of a position's day, or null when the day has no weekday. */
export function dateForPosition(
  snapshot: ProgramSnapshot,
  startDate: string,
  position: Position,
  weekdayMap?: WeekdayMap,
): string | null {
  const found = findDay(snapshot, position);
  if (!found) return null;
  const weekday = weekdayForDay(found.day, weekdayMap);
  if (weekday === null) return null;
  const total = totalWeeks(snapshot);
  const weeksFromStart =
    (position.cycle - 1) * total + (position.weekIndex - 1);
  const start = startOfWeek(parseISO(startDate), MONDAY);
  return format(
    addDays(start, weeksFromStart * 7 + (weekday - 1)),
    DATE_FORMAT,
  );
}

/**
 * Start date that makes `targetWeekIndex` (of cycle 1) the week containing
 * `localDate`. Used when a CALENDAR-mode user jumps to another week.
 */
export function startDateForWeek(
  targetWeekIndex: number,
  localDate: string,
): string {
  const monday = startOfWeek(parseISO(localDate), MONDAY);
  return format(addDays(monday, -(targetWeekIndex - 1) * 7), DATE_FORMAT);
}
