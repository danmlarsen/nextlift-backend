import {
  gzclpDayA1,
  makeBlock,
  makeDay,
  makeExercise,
  makeProgram,
  makeSets,
  resetFixtureIds,
} from '../engine/testing/fixtures';
import {
  validateProgramForEnrollment,
  validateWeekdayMap,
} from './validate-program';

describe('validateProgramForEnrollment', () => {
  beforeEach(resetFixtureIds);

  it('accepts a complete program', () => {
    const program = makeProgram(
      [makeBlock({ weekCount: 1, days: [gzclpDayA1()] })],
      {
        durationMode: 'OPEN_ENDED',
      },
    );
    expect(validateProgramForEnrollment(program)).toEqual([]);
  });

  it('reports structural gaps', () => {
    const empty = makeProgram([]);
    expect(validateProgramForEnrollment(empty)).toEqual(
      expect.arrayContaining([
        'The program has no blocks',
        'The program has no weeks',
      ]),
    );

    const noSets = makeProgram([
      makeBlock({
        days: [
          makeDay({
            name: 'A',
            exercises: [
              makeExercise({
                name: 'Squat',
                progression: { strategy: 'LINEAR', incrementKg: 2.5 },
              }),
            ],
          }),
        ],
      }),
    ]);
    expect(validateProgramForEnrollment(noSets)).toEqual([
      '"Squat" on day "A" has no sets',
    ]);

    const noParams = makeProgram([
      makeBlock({
        days: [
          makeDay({
            name: 'A',
            exercises: [
              makeExercise({
                name: 'Squat',
                strategy: 'LINEAR',
                sets: makeSets(1, { repsMin: 5 }),
              }),
            ],
          }),
        ],
      }),
    ]);
    expect(validateProgramForEnrollment(noParams)).toEqual([
      '"Squat" on day "A" is missing progression settings',
    ]);
  });

  it('rejects shared keys that point at different exercises or mix strategies', () => {
    const a = makeExercise({
      progressionKey: 'main',
      exerciseId: 1,
      progression: { strategy: 'LINEAR', incrementKg: 2.5 },
      sets: makeSets(1, { repsMin: 5 }),
    });
    const b = makeExercise({
      progressionKey: 'main',
      exerciseId: 2,
      progression: { strategy: 'LINEAR', incrementKg: 2.5 },
      sets: makeSets(1, { repsMin: 5 }),
    });
    const c = makeExercise({
      progressionKey: 'main',
      exerciseId: 1,
      progression: { strategy: 'DOUBLE', incrementKg: 2.5 },
      sets: makeSets(1, { repsMin: 8, repsMax: 12 }),
    });
    const problems = validateProgramForEnrollment(
      makeProgram([makeBlock({ days: [makeDay({ exercises: [a, b, c] })] })]),
    );
    expect(problems).toEqual([
      'Progression key "main" is used by two different exercises',
      'Progression key "main" mixes strategies LINEAR and DOUBLE',
    ]);
  });

  it('requires unique weekdays for calendar programs', () => {
    const program = makeProgram(
      [
        makeBlock({
          name: 'Week',
          days: [
            makeDay({
              name: 'Mon',
              weekday: 1,
              exercises: [makeExercise({ sets: makeSets(1, { repsMin: 5 }) })],
            }),
            makeDay({
              name: 'Also Mon',
              weekday: 1,
              exercises: [makeExercise({ sets: makeSets(1, { repsMin: 5 }) })],
            }),
            makeDay({
              name: 'Floating',
              exercises: [makeExercise({ sets: makeSets(1, { repsMin: 5 }) })],
            }),
          ],
        }),
      ],
      { scheduleMode: 'CALENDAR' },
    );
    expect(validateProgramForEnrollment(program)).toEqual([
      'Two days in block "Week" share the same weekday',
      'Day "Floating" needs a weekday in a calendar program',
    ]);
  });
});

describe('validateWeekdayMap', () => {
  beforeEach(resetFixtureIds);

  const program = makeProgram(
    [
      makeBlock({
        name: 'Week',
        days: [
          makeDay({ id: 11, weekday: 1, exercises: [makeExercise()] }),
          makeDay({ id: 12, weekday: 3, exercises: [makeExercise()] }),
        ],
      }),
    ],
    { scheduleMode: 'CALENDAR' },
  );

  it('accepts empty maps and valid overrides', () => {
    expect(validateWeekdayMap(program, undefined)).toEqual([]);
    expect(validateWeekdayMap(program, { '11': 2 })).toEqual([]);
  });

  it('rejects unknown days, bad weekdays and collisions', () => {
    expect(validateWeekdayMap(program, { '99': 2 })).toEqual([
      'Unknown program day 99',
    ]);
    expect(validateWeekdayMap(program, { '11': 8 })).toEqual([
      'Weekday for day 11 must be between 1 (Monday) and 7 (Sunday)',
    ]);
    expect(validateWeekdayMap(program, { '11': 3 })).toEqual([
      'Two days in block "Week" would share the same weekday',
    ]);
  });
});
