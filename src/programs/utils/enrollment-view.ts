import { addDays, format, parseISO } from 'date-fns';
import {
  dateForPosition,
  findDay,
  locateWeek,
  positionForDate,
  sortedDays,
  totalWeeks,
  weekdayForDay,
} from '../engine/schedule';
import { resolveDay } from '../engine/resolve-day';
import {
  ExerciseState,
  Position,
  ProgramSnapshot,
  ResolvedDay,
} from '../engine/types';

export type DayLogLite = {
  cycle: number;
  weekIndex: number;
  dayIndex: number;
  status: 'STARTED' | 'COMPLETED' | 'SKIPPED';
  workoutId: number | null;
  completedAt: Date | null;
};

export type DayStatus =
  'PENDING' | 'STARTED' | 'COMPLETED' | 'SKIPPED' | 'MISSED';

export type DayView = {
  dayIndex: number;
  dayId: number;
  dayName: string;
  weekday: number | null;
  date: string | null;
  status: DayStatus;
  workoutId: number | null;
  exerciseNames: string[];
};

export type WeekView = {
  weekIndex: number;
  blockIndex: number;
  blockName: string;
  weekInBlock: number;
  weekLabel: string | null;
  isDeload: boolean;
  days: DayView[];
};

export type Adherence = {
  planned: number;
  completed: number;
  skipped: number;
  missed: number;
  plannedElapsed: number;
};

export type ScheduleView = {
  mode: 'SEQUENCE' | 'CALENDAR';
  localDate: string;
  position: Position;
  totalWeeks: number;
  today: ResolvedDay | null;
  todayStatus: DayStatus | null;
  next: ResolvedDay | null;
  nextDate: string | null;
  weeks: WeekView[];
  adherence: Adherence;
};

export type EnrollmentLike = {
  startDate: Date | string;
  weekdayMap: unknown;
  currentCycle: number;
  currentWeekIndex: number;
  currentDayIndex: number;
};

export function toDateString(value: Date | string): string {
  return typeof value === 'string'
    ? value.slice(0, 10)
    : value.toISOString().slice(0, 10);
}

export function todayString(now: Date = new Date()): string {
  return format(now, 'yyyy-MM-dd');
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function logKey(position: Position): string {
  return `${position.cycle}:${position.weekIndex}:${position.dayIndex}`;
}

function statusFor(log: DayLogLite | undefined, isPast: boolean): DayStatus {
  if (log?.status === 'COMPLETED') return 'COMPLETED';
  if (log?.status === 'SKIPPED') return 'SKIPPED';
  if (log?.status === 'STARTED') return 'STARTED';
  return isPast ? 'MISSED' : 'PENDING';
}

/**
 * Everything the active-program screen needs: the pointer, today's and the
 * next workout, every day of the current cycle with a status, and adherence.
 * Pure: derived from the snapshot, the day log and the client's local date.
 */
export function buildScheduleView(
  snapshot: ProgramSnapshot,
  enrollment: EnrollmentLike,
  statesByKey: ReadonlyMap<string, ExerciseState>,
  dayLogs: DayLogLite[],
  localDate: string,
): ScheduleView {
  const mode = snapshot.scheduleMode;
  const startDate = toDateString(enrollment.startDate);
  const weekdayMap = (enrollment.weekdayMap ?? undefined) as
    Record<string, number> | undefined;
  const position: Position = {
    cycle: enrollment.currentCycle,
    weekIndex: enrollment.currentWeekIndex,
    dayIndex: enrollment.currentDayIndex,
  };
  const logs = new Map(dayLogs.map((log) => [logKey(log), log]));
  const total = totalWeeks(snapshot);

  const weeks: WeekView[] = [];
  for (let weekIndex = 1; weekIndex <= total; weekIndex++) {
    const location = locateWeek(snapshot, weekIndex);
    if (!location) continue;
    const days = sortedDays(location.block).map((day, index): DayView => {
      const dayPosition = {
        cycle: position.cycle,
        weekIndex,
        dayIndex: index + 1,
      };
      const date =
        mode === 'CALENDAR'
          ? dateForPosition(snapshot, startDate, dayPosition, weekdayMap)
          : null;
      const isPast =
        mode === 'CALENDAR'
          ? date !== null && date < localDate
          : weekIndex < position.weekIndex ||
            (weekIndex === position.weekIndex && index + 1 < position.dayIndex);
      const log = logs.get(logKey(dayPosition));
      return {
        dayIndex: index + 1,
        dayId: day.id,
        dayName: day.name,
        weekday: weekdayForDay(day, weekdayMap),
        date,
        status: statusFor(log, isPast),
        workoutId: log?.workoutId ?? null,
        exerciseNames: day.exercises.map((exercise) => exercise.exercise.name),
      };
    });
    weeks.push({
      weekIndex,
      blockIndex: location.blockIndex,
      blockName: location.block.name,
      weekInBlock: location.weekInBlock,
      weekLabel: location.week.label,
      isDeload: location.week.isDeload,
      days,
    });
  }

  const allDays = weeks.flatMap((week) => week.days);
  const adherence: Adherence = {
    planned: allDays.length,
    completed: allDays.filter((d) => d.status === 'COMPLETED').length,
    skipped: allDays.filter((d) => d.status === 'SKIPPED').length,
    missed: allDays.filter((d) => d.status === 'MISSED').length,
    plannedElapsed: allDays.filter(
      (d) => d.status !== 'PENDING' && d.status !== 'STARTED',
    ).length,
  };

  let today: ResolvedDay | null = null;
  let todayStatus: DayStatus | null = null;
  let next: ResolvedDay | null = null;
  let nextDate: string | null = null;

  if (mode === 'CALENDAR') {
    const pinned = positionForDate(snapshot, startDate, localDate, weekdayMap);
    if (pinned) {
      today = resolveDay(snapshot, pinned.position, statesByKey);
      todayStatus = statusFor(logs.get(logKey(pinned.position)), false);
    }
    // The next workout is the first pinned day from today on without a
    // completed or skipped log, within the next four weeks.
    for (let offset = 0; offset < 28 && !next; offset++) {
      const date = format(addDays(parseISO(localDate), offset), 'yyyy-MM-dd');
      const candidate = positionForDate(snapshot, startDate, date, weekdayMap);
      if (!candidate) continue;
      const log = logs.get(logKey(candidate.position));
      if (log?.status === 'COMPLETED' || log?.status === 'SKIPPED') continue;
      next = resolveDay(snapshot, candidate.position, statesByKey);
      nextDate = date;
    }
  } else if (findDay(snapshot, position)) {
    next = resolveDay(snapshot, position, statesByKey);
  }

  return {
    mode,
    localDate,
    position,
    totalWeeks: total,
    today,
    todayStatus,
    next,
    nextDate,
    weeks,
    adherence,
  };
}
