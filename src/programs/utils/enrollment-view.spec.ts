import {
  makeBlock,
  makeDay,
  makeExercise,
  makeProgram,
  makeSets,
  makeState,
  resetFixtureIds,
  statesMap,
} from '../engine/testing/fixtures';
import {
  buildScheduleView,
  DayLogLite,
  isIsoDate,
  toDateString,
} from './enrollment-view';

const exercise = () =>
  makeExercise({
    progressionKey: 'squat',
    exerciseId: 1,
    progression: { strategy: 'LINEAR', incrementKg: 2.5 },
    sets: makeSets(3, { repsMin: 5 }),
  });

const log = (
  weekIndex: number,
  dayIndex: number,
  status: DayLogLite['status'],
  workoutId: number | null = null,
): DayLogLite => ({
  cycle: 1,
  weekIndex,
  dayIndex,
  status,
  workoutId,
  completedAt: null,
});

describe('enrollment view helpers', () => {
  it('formats dates and validates ISO dates', () => {
    expect(toDateString(new Date('2026-09-07T00:00:00.000Z'))).toBe(
      '2026-09-07',
    );
    expect(toDateString('2026-09-07T12:00:00Z')).toBe('2026-09-07');
    expect(isIsoDate('2026-09-07')).toBe(true);
    expect(isIsoDate('07.09.2026')).toBe(false);
  });
});

describe('buildScheduleView', () => {
  beforeEach(resetFixtureIds);

  it('derives statuses, the next day and adherence for a sequence program', () => {
    const program = makeProgram([
      makeBlock({
        weekCount: 2,
        days: [
          makeDay({ name: 'A', exercises: [exercise()] }),
          makeDay({ name: 'B', exercises: [exercise()] }),
        ],
      }),
    ]);
    const enrollment = {
      startDate: '2026-09-07',
      weekdayMap: null,
      currentCycle: 1,
      currentWeekIndex: 2,
      currentDayIndex: 1,
    };
    const states = statesMap(
      makeState({ progressionKey: 'squat', exerciseId: 1, workingWeight: 100 }),
    );

    const view = buildScheduleView(
      program,
      enrollment,
      states,
      [log(1, 1, 'COMPLETED', 5), log(1, 2, 'SKIPPED')],
      '2026-09-20',
    );

    expect(view.mode).toBe('SEQUENCE');
    expect(view.today).toBeNull();
    expect(view.next).toMatchObject({
      dayName: 'A',
      position: { cycle: 1, weekIndex: 2, dayIndex: 1 },
    });
    expect(view.next!.exercises[0].sets[0].weight).toBe(100);
    expect(
      view.weeks.map((week) => week.days.map((day) => day.status)),
    ).toEqual([
      ['COMPLETED', 'SKIPPED'],
      ['PENDING', 'PENDING'],
    ]);
    expect(view.weeks[0].days[0].workoutId).toBe(5);
    expect(view.adherence).toEqual({
      planned: 4,
      completed: 1,
      skipped: 1,
      missed: 0,
      plannedElapsed: 2,
    });
  });

  it('marks un-logged days before the pointer as missed', () => {
    const program = makeProgram([
      makeBlock({
        weekCount: 1,
        days: [
          makeDay({ exercises: [exercise()] }),
          makeDay({ exercises: [exercise()] }),
          makeDay({ exercises: [exercise()] }),
        ],
      }),
    ]);
    const enrollment = {
      startDate: '2026-09-07',
      weekdayMap: null,
      currentCycle: 1,
      currentWeekIndex: 1,
      currentDayIndex: 3,
    };
    const view = buildScheduleView(
      program,
      enrollment,
      new Map(),
      [log(1, 2, 'COMPLETED')],
      '2026-09-10',
    );
    expect(view.weeks[0].days.map((day) => day.status)).toEqual([
      'MISSED',
      'COMPLETED',
      'PENDING',
    ]);
    expect(view.adherence.missed).toBe(1);
  });

  it('resolves today, dates and the next pinned day for a calendar program', () => {
    const program = makeProgram(
      [
        makeBlock({
          weekCount: 2,
          days: [
            makeDay({
              id: 11,
              name: 'Mon',
              weekday: 1,
              exercises: [exercise()],
            }),
            makeDay({
              id: 12,
              name: 'Wed',
              weekday: 3,
              exercises: [exercise()],
            }),
            makeDay({
              id: 13,
              name: 'Fri',
              weekday: 5,
              exercises: [exercise()],
            }),
          ],
        }),
      ],
      { scheduleMode: 'CALENDAR' },
    );
    const enrollment = {
      startDate: new Date('2026-09-07T00:00:00.000Z'),
      weekdayMap: null,
      currentCycle: 1,
      currentWeekIndex: 1,
      currentDayIndex: 1,
    };

    // Wednesday of week 1; Monday was never logged.
    const view = buildScheduleView(
      program,
      enrollment,
      new Map(),
      [],
      '2026-09-09',
    );
    expect(view.mode).toBe('CALENDAR');
    expect(view.today).toMatchObject({ dayName: 'Wed' });
    expect(view.todayStatus).toBe('PENDING');
    expect(view.next).toMatchObject({ dayName: 'Wed' });
    expect(view.nextDate).toBe('2026-09-09');
    expect(view.weeks[0].days.map((day) => [day.date, day.status])).toEqual([
      ['2026-09-07', 'MISSED'],
      ['2026-09-09', 'PENDING'],
      ['2026-09-11', 'PENDING'],
    ]);

    // Today's day completed: the next one is Friday.
    const later = buildScheduleView(
      program,
      enrollment,
      new Map(),
      [log(1, 2, 'COMPLETED', 9)],
      '2026-09-09',
    );
    expect(later.todayStatus).toBe('COMPLETED');
    expect(later.next).toMatchObject({ dayName: 'Fri' });
    expect(later.nextDate).toBe('2026-09-11');

    // A rest day: no today, next is the following Monday.
    const rest = buildScheduleView(
      program,
      enrollment,
      new Map(),
      [],
      '2026-09-12',
    );
    expect(rest.today).toBeNull();
    expect(rest.next).toMatchObject({
      dayName: 'Mon',
      position: { weekIndex: 2 },
    });
    expect(rest.nextDate).toBe('2026-09-14');
  });

  it('honours weekday overrides', () => {
    const program = makeProgram(
      [
        makeBlock({
          weekCount: 1,
          days: [
            makeDay({
              id: 11,
              name: 'Mon',
              weekday: 1,
              exercises: [exercise()],
            }),
          ],
        }),
      ],
      { scheduleMode: 'CALENDAR' },
    );
    const enrollment = {
      startDate: '2026-09-07',
      weekdayMap: { '11': 2 },
      currentCycle: 1,
      currentWeekIndex: 1,
      currentDayIndex: 1,
    };
    const view = buildScheduleView(
      program,
      enrollment,
      new Map(),
      [],
      '2026-09-08',
    );
    expect(view.today).toMatchObject({ dayName: 'Mon' });
    expect(view.weeks[0].days[0]).toMatchObject({
      weekday: 2,
      date: '2026-09-08',
    });
  });
});
