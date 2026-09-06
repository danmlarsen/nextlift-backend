import {
  makeBlock,
  makeDay,
  makeProgram,
  makeWeek,
  resetFixtureIds,
} from './testing/fixtures';
import {
  comparePositions,
  dateForPosition,
  findDay,
  isValidPosition,
  locateWeek,
  mondayOf,
  nextPosition,
  positionForDate,
  positionsBetween,
  startDateForWeek,
  totalWeeks,
  weekForDate,
} from './schedule';

describe('schedule', () => {
  beforeEach(resetFixtureIds);

  const twoBlocks = (durationMode: 'FIXED' | 'OPEN_ENDED' = 'FIXED') =>
    makeProgram(
      [
        makeBlock({
          name: 'Load',
          weekCount: 3,
          days: [makeDay({ name: 'A' }), makeDay({ name: 'B' })],
        }),
        makeBlock({
          name: 'Deload',
          weeks: [makeWeek(1, { isDeload: true })],
          days: [makeDay({ name: 'A light' })],
        }),
      ],
      { durationMode },
    );

  it('counts weeks across blocks and locates a week in its block', () => {
    const program = twoBlocks();
    expect(totalWeeks(program)).toBe(4);
    expect(locateWeek(program, 1)).toMatchObject({
      blockIndex: 0,
      weekInBlock: 1,
    });
    expect(locateWeek(program, 3)).toMatchObject({
      blockIndex: 0,
      weekInBlock: 3,
    });
    expect(locateWeek(program, 4)).toMatchObject({
      blockIndex: 1,
      weekInBlock: 1,
    });
    expect(locateWeek(program, 5)).toBeNull();
    expect(locateWeek(program, 0)).toBeNull();
  });

  it('finds days by position and validates positions', () => {
    const program = twoBlocks();
    expect(
      findDay(program, { cycle: 1, weekIndex: 2, dayIndex: 2 })?.day.name,
    ).toBe('B');
    expect(
      findDay(program, { cycle: 1, weekIndex: 4, dayIndex: 1 })?.day.name,
    ).toBe('A light');
    expect(
      findDay(program, { cycle: 1, weekIndex: 4, dayIndex: 2 }),
    ).toBeNull();
    expect(
      isValidPosition(program, { cycle: 2, weekIndex: 1, dayIndex: 1 }),
    ).toBe(false);
    expect(
      isValidPosition(twoBlocks('OPEN_ENDED'), {
        cycle: 2,
        weekIndex: 1,
        dayIndex: 1,
      }),
    ).toBe(true);
  });

  it('steps through days, weeks, blocks and cycles', () => {
    const fixed = twoBlocks();
    expect(
      nextPosition(fixed, { cycle: 1, weekIndex: 1, dayIndex: 1 }),
    ).toEqual({ cycle: 1, weekIndex: 1, dayIndex: 2 });
    expect(
      nextPosition(fixed, { cycle: 1, weekIndex: 1, dayIndex: 2 }),
    ).toEqual({ cycle: 1, weekIndex: 2, dayIndex: 1 });
    expect(
      nextPosition(fixed, { cycle: 1, weekIndex: 3, dayIndex: 2 }),
    ).toEqual({ cycle: 1, weekIndex: 4, dayIndex: 1 });
    expect(
      nextPosition(fixed, { cycle: 1, weekIndex: 4, dayIndex: 1 }),
    ).toBeNull();

    const open = twoBlocks('OPEN_ENDED');
    expect(nextPosition(open, { cycle: 1, weekIndex: 4, dayIndex: 1 })).toEqual(
      { cycle: 2, weekIndex: 1, dayIndex: 1 },
    );
  });

  it('lists the positions passed over by a forward jump', () => {
    const program = twoBlocks();
    const between = positionsBetween(
      program,
      { cycle: 1, weekIndex: 1, dayIndex: 1 },
      { cycle: 1, weekIndex: 2, dayIndex: 2 },
    );
    expect(between).toEqual([
      { cycle: 1, weekIndex: 1, dayIndex: 2 },
      { cycle: 1, weekIndex: 2, dayIndex: 1 },
    ]);
    expect(
      positionsBetween(
        program,
        { cycle: 1, weekIndex: 2, dayIndex: 2 },
        { cycle: 1, weekIndex: 1, dayIndex: 1 },
      ),
    ).toEqual([]);
  });

  it('orders positions', () => {
    expect(
      comparePositions(
        { cycle: 1, weekIndex: 4, dayIndex: 1 },
        { cycle: 2, weekIndex: 1, dayIndex: 1 },
      ),
    ).toBeLessThan(0);
    expect(
      comparePositions(
        { cycle: 1, weekIndex: 2, dayIndex: 1 },
        { cycle: 1, weekIndex: 1, dayIndex: 3 },
      ),
    ).toBeGreaterThan(0);
    expect(
      comparePositions(
        { cycle: 1, weekIndex: 1, dayIndex: 1 },
        { cycle: 1, weekIndex: 1, dayIndex: 1 },
      ),
    ).toBe(0);
  });

  describe('calendar mode', () => {
    // Mon 2026-09-07 start; days pinned to Mon / Wed / Fri.
    const calendar = (durationMode: 'FIXED' | 'OPEN_ENDED' = 'FIXED') =>
      makeProgram(
        [
          makeBlock({
            weekCount: 2,
            days: [
              makeDay({ id: 11, name: 'Mon', weekday: 1 }),
              makeDay({ id: 12, name: 'Wed', weekday: 3 }),
              makeDay({ id: 13, name: 'Fri', weekday: 5 }),
            ],
          }),
        ],
        { scheduleMode: 'CALENDAR', durationMode },
      );

    it('normalises any date to its Monday', () => {
      expect(mondayOf('2026-09-09')).toBe('2026-09-07');
      expect(mondayOf('2026-09-13')).toBe('2026-09-07');
      expect(mondayOf('2026-09-07')).toBe('2026-09-07');
    });

    it('maps dates to weeks, wrapping only for open-ended programs', () => {
      const fixed = calendar();
      expect(weekForDate(fixed, '2026-09-07', '2026-09-09')).toEqual({
        cycle: 1,
        weekIndex: 1,
      });
      expect(weekForDate(fixed, '2026-09-07', '2026-09-14')).toEqual({
        cycle: 1,
        weekIndex: 2,
      });
      expect(weekForDate(fixed, '2026-09-07', '2026-09-21')).toBeNull();
      expect(weekForDate(fixed, '2026-09-07', '2026-09-06')).toBeNull();
      expect(
        weekForDate(calendar('OPEN_ENDED'), '2026-09-07', '2026-09-23'),
      ).toEqual({ cycle: 2, weekIndex: 1 });
    });

    it('resolves the pinned day, rest days and weekday overrides', () => {
      const program = calendar();
      expect(
        positionForDate(program, '2026-09-07', '2026-09-09'),
      ).toMatchObject({
        position: { cycle: 1, weekIndex: 1, dayIndex: 2 },
        day: { name: 'Wed' },
      });
      expect(positionForDate(program, '2026-09-07', '2026-09-15')).toBeNull();
      expect(
        positionForDate(program, '2026-09-07', '2026-09-15', { '12': 2 }),
      ).toMatchObject({
        position: { cycle: 1, weekIndex: 2, dayIndex: 2 },
      });
    });

    it('computes the date of a position and the inverse start date for a jump', () => {
      const program = calendar('OPEN_ENDED');
      expect(
        dateForPosition(program, '2026-09-07', {
          cycle: 1,
          weekIndex: 2,
          dayIndex: 3,
        }),
      ).toBe('2026-09-18');
      expect(
        dateForPosition(program, '2026-09-07', {
          cycle: 2,
          weekIndex: 1,
          dayIndex: 1,
        }),
      ).toBe('2026-09-21');
      expect(
        dateForPosition(
          program,
          '2026-09-07',
          { cycle: 1, weekIndex: 1, dayIndex: 2 },
          { '12': 4 },
        ),
      ).toBe('2026-09-10');
      expect(startDateForWeek(3, '2026-09-23')).toBe('2026-09-07');
      expect(startDateForWeek(1, '2026-09-23')).toBe('2026-09-21');
    });
  });
});
