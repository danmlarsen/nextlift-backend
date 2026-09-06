import {
  collectSlots,
  deriveEnrollmentDefaults,
  initialStateForSlot,
  requiredField,
} from './enrollment-defaults';
import {
  gzclpProgram,
  makeBlock,
  makeDay,
  makeExercise,
  makeProgram,
  makeSets,
  resetFixtureIds,
} from './testing/fixtures';

describe('enrollment defaults', () => {
  beforeEach(resetFixtureIds);

  it('maps each strategy to the state value it prescribes from', () => {
    expect(requiredField({ strategy: 'LINEAR', incrementKg: 2.5 })).toBe(
      'workingWeight',
    );
    expect(requiredField({ strategy: 'DOUBLE', incrementKg: 2.5 })).toBe(
      'workingWeight',
    );
    expect(
      requiredField({ strategy: 'DOUBLE', incrementKg: 0, mode: 'REPS' }),
    ).toBeNull();
    expect(requiredField({ strategy: 'PERCENT_TM', tmIncrementKg: 5 })).toBe(
      'trainingMax',
    );
    expect(
      requiredField({
        strategy: 'RPE',
        mode: 'TOP_SET_BACKOFF',
        backoffPercent: 90,
        backoffSets: 3,
      }),
    ).toBe('e1rm');
    expect(
      requiredField({
        strategy: 'RPE',
        mode: 'RIR_MESOCYCLE',
        startRir: 3,
        endRir: 0,
        addSetsPerWeek: 1,
        maxSets: 5,
        incrementKg: 2.5,
      }),
    ).toBe('workingWeight');
    expect(requiredField({ strategy: 'NONE' })).toBeNull();
    expect(requiredField({ strategy: 'NONE', basis: 'TRAINING_MAX' })).toBe(
      'trainingMax',
    );
  });

  it('collects one slot per key, preferring the slot that drives progression', () => {
    const supplemental = makeExercise({
      progressionKey: 'squat',
      exerciseId: 1,
      progression: { strategy: 'NONE', basis: 'TRAINING_MAX' },
    });
    const main = makeExercise({
      progressionKey: 'squat',
      exerciseId: 1,
      progression: { strategy: 'PERCENT_TM', tmIncrementKg: 5 },
    });
    const program = makeProgram([
      makeBlock({ days: [makeDay({ exercises: [supplemental, main] })] }),
    ]);

    const slots = collectSlots(program);
    expect(slots).toHaveLength(1);
    expect(slots[0].params.strategy).toBe('PERCENT_TM');
  });

  it('suggests starting values from history per required field', () => {
    const squat = makeExercise({
      progressionKey: 'squat',
      exerciseId: 1,
      progression: { strategy: 'PERCENT_TM', tmIncrementKg: 5 },
      sets: makeSets(3, { repsMin: 5, percent: 70 }),
    });
    const bench = makeExercise({
      progressionKey: 'bench',
      exerciseId: 2,
      progression: { strategy: 'LINEAR', incrementKg: 2.5 },
      sets: makeSets(3, { repsMin: 5 }),
    });
    const rdl = makeExercise({
      progressionKey: 'rdl',
      exerciseId: 3,
      progression: {
        strategy: 'RPE',
        mode: 'TOP_SET_BACKOFF',
        backoffPercent: 90,
        backoffSets: 2,
      },
      sets: makeSets(1, { repsMin: 5, targetRpe: 8 }),
    });
    const plank = makeExercise({
      progressionKey: 'plank',
      exerciseId: 4,
      progression: { strategy: 'NONE' },
      sets: makeSets(3, { duration: 60 }),
    });
    const program = makeProgram([
      makeBlock({ days: [makeDay({ exercises: [squat, bench, rdl, plank] })] }),
    ]);

    const defaults = deriveEnrollmentDefaults(
      program,
      new Map([
        [1, { lastWorkingWeight: 100, e1rmRecord: 120 }],
        [2, { lastWorkingWeight: 62.5, e1rmRecord: 80 }],
        [3, { lastWorkingWeight: null, e1rmRecord: 140.123 }],
      ]),
    );

    expect(defaults).toEqual([
      expect.objectContaining({
        progressionKey: 'squat',
        field: 'trainingMax',
        suggested: 107.5,
        source: 'PR_1RM',
      }),
      expect.objectContaining({
        progressionKey: 'bench',
        field: 'workingWeight',
        suggested: 62.5,
        source: 'LAST_WORKOUT',
      }),
      expect.objectContaining({
        progressionKey: 'rdl',
        field: 'e1rm',
        suggested: 140.12,
        source: 'PR_1RM',
      }),
      expect.objectContaining({
        progressionKey: 'plank',
        field: null,
        suggested: null,
        source: null,
      }),
    ]);
  });

  it('returns empty suggestions without history and lists every GZCLP key', () => {
    const defaults = deriveEnrollmentDefaults(gzclpProgram(), new Map());
    expect(defaults.map((d) => d.progressionKey)).toEqual([
      't1-squat',
      't2-bench',
      't3-lat-pulldown',
    ]);
    expect(
      defaults.every(
        (d) =>
          d.suggested === null &&
          d.field === 'workingWeight' &&
          d.roundingKg === 2.5,
      ),
    ).toBe(true);
  });

  it('builds the initial state, deriving a training max from a given e1RM', () => {
    const [slot] = collectSlots(
      makeProgram([
        makeBlock({
          days: [
            makeDay({
              exercises: [
                makeExercise({
                  progressionKey: 'squat',
                  exerciseId: 1,
                  progression: {
                    strategy: 'PERCENT_TM',
                    tmIncrementKg: 5,
                    tmPercentOf1RM: 85,
                  },
                }),
              ],
            }),
          ],
        }),
      ]),
    );
    expect(initialStateForSlot(slot, { e1rm: 120 })).toMatchObject({
      trainingMax: 102.5,
      e1rm: 120,
      exerciseId: 1,
      stageIndex: 0,
    });
    expect(
      initialStateForSlot(slot, {
        trainingMax: 100,
        exerciseId: 9,
        roundingKg: 5,
      }),
    ).toMatchObject({ trainingMax: 100, exerciseId: 9, roundingKg: 5 });
    expect(initialStateForSlot(slot, undefined)).toMatchObject({
      trainingMax: null,
      workingWeight: null,
    });
  });
});
