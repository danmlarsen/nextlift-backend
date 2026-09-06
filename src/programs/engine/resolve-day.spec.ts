import {
  applyWeekModifiers,
  defaultState,
  resolveDay,
  rowsForWeek,
} from './resolve-day';
import {
  gzclpProgram,
  makeBlock,
  makeDay,
  makeExercise,
  makeProgram,
  makeSet,
  makeSets,
  makeState,
  makeWeek,
  resetFixtureIds,
  statesMap,
} from './testing/fixtures';
import { ResolvedSet } from './types';

describe('rowsForWeek', () => {
  beforeEach(resetFixtureIds);

  it('prefers rows scoped to the week and falls back to unscoped rows', () => {
    const rows = [
      makeSet({ setOrder: 2, percent: 75 }),
      makeSet({ setOrder: 1, percent: 65 }),
      makeSet({ setOrder: 1, percent: 70, weekInBlock: 2 }),
      makeSet({ setOrder: 2, percent: 80, weekInBlock: 2 }),
    ];
    expect(rowsForWeek(rows, 1).map((r) => r.percent)).toEqual([65, 75]);
    expect(rowsForWeek(rows, 2).map((r) => r.percent)).toEqual([70, 80]);
    expect(rowsForWeek(rows, 3).map((r) => r.percent)).toEqual([65, 75]);
  });
});

describe('applyWeekModifiers', () => {
  const working = (count: number, weight: number | null): ResolvedSet[] =>
    Array.from({ length: count }, (_, index) => ({
      programSetId: index + 1,
      setOrder: index + 1,
      type: 'normal',
      repsMin: 5,
      repsMax: 5,
      isAmrap: index === count - 1,
      targetRpe: null,
      restSeconds: null,
      duration: null,
      weight,
      percent: null,
      basis: 'WORKING_WEIGHT',
      notes: null,
    }));

  it('returns the sets untouched on a normal week', () => {
    const sets = working(5, 60);
    expect(applyWeekModifiers(sets, makeWeek(1), 2.5)).toBe(sets);
  });

  it('trims volume, scales intensity and clears AMRAPs on a deload week', () => {
    const week = makeWeek(4, {
      isDeload: true,
      volumeMultiplier: 0.5,
      intensityMultiplier: 0.6,
    });
    const out = applyWeekModifiers(working(5, 60), week, 2.5);
    expect(out).toHaveLength(3);
    expect(out.every((s) => s.weight === 35 && !s.isAmrap)).toBe(true);
    expect(out.map((s) => s.setOrder)).toEqual([1, 2, 3]);
  });

  it('keeps warm-ups, never drops below one working set and tolerates empty loads', () => {
    const warmup: ResolvedSet = {
      ...working(1, 20)[0],
      type: 'warmup',
      programSetId: 99,
      isAmrap: false,
    };
    const week = makeWeek(2, {
      volumeMultiplier: 0.2,
      intensityMultiplier: 0.9,
    });
    const out = applyWeekModifiers([warmup, ...working(2, null)], week, 2.5);
    expect(out.map((s) => s.type)).toEqual(['warmup', 'normal']);
    expect(out[1].weight).toBeNull();
  });
});

describe('resolveDay', () => {
  beforeEach(resetFixtureIds);

  it('resolves a GZCLP day with every tier prescribed from its state', () => {
    const program = gzclpProgram();
    const states = statesMap(
      makeState({
        progressionKey: 't1-squat',
        exerciseId: 1,
        workingWeight: 60,
      }),
      makeState({
        progressionKey: 't2-bench',
        exerciseId: 2,
        workingWeight: 40,
      }),
      makeState({
        progressionKey: 't3-lat-pulldown',
        exerciseId: 3,
        workingWeight: 30,
      }),
    );

    const day = resolveDay(
      program,
      { cycle: 1, weekIndex: 1, dayIndex: 1 },
      states,
    );

    expect(day).toMatchObject({
      dayName: 'A1',
      blockName: 'Rotation',
      isDeload: false,
      weekInBlock: 1,
    });
    const [squat, bench, pulldown] = day!.exercises;
    expect(squat.sets).toHaveLength(5);
    expect(
      squat.sets.every(
        (s) => s.weight === 60 && s.repsMin === 3 && s.restSeconds === 180,
      ),
    ).toBe(true);
    expect(squat.sets[4].isAmrap).toBe(true);
    expect(bench.sets.map((s) => [s.weight, s.repsMin])).toEqual([
      [40, 10],
      [40, 10],
      [40, 10],
    ]);
    expect(pulldown.sets.map((s) => s.isAmrap)).toEqual([false, false, true]);
    expect(pulldown.sets[0].weight).toBe(30);
  });

  it('uses default state (no loads) for slots without a state row', () => {
    const day = resolveDay(
      gzclpProgram(),
      { cycle: 1, weekIndex: 1, dayIndex: 1 },
      new Map(),
    );
    expect(
      day!.exercises.every((exercise) =>
        exercise.sets.every((s) => s.weight === null),
      ),
    ).toBe(true);
    expect(
      defaultState(gzclpProgram().blocks[0].days[0].exercises[0]),
    ).toMatchObject({
      progressionKey: 't1-squat',
      workingWeight: null,
      stageIndex: 0,
    });
  });

  it('returns null for positions outside the program', () => {
    expect(
      resolveDay(
        gzclpProgram(),
        { cycle: 1, weekIndex: 2, dayIndex: 1 },
        new Map(),
      ),
    ).toBeNull();
    expect(
      resolveDay(
        gzclpProgram(),
        { cycle: 1, weekIndex: 1, dayIndex: 9 },
        new Map(),
      ),
    ).toBeNull();
  });

  it('applies week-scoped rows and deload modifiers (5/3/1 wave)', () => {
    const wave = (week: number, percents: number[], reps: number) =>
      percents.map((percent, index) =>
        makeSet({
          setOrder: index + 1,
          weekInBlock: week,
          percent,
          repsMin: reps,
          repsMax: reps,
          isAmrap: index === 2,
        }),
      );
    const squat = makeExercise({
      name: 'Barbell Squat',
      exerciseId: 1,
      progressionKey: 'squat',
      progression: { strategy: 'PERCENT_TM', tmIncrementKg: 5 },
      sets: [
        ...wave(1, [65, 75, 85], 5),
        ...wave(2, [70, 80, 90], 3),
        ...wave(3, [75, 85, 95], 1),
        ...wave(4, [40, 50, 60], 5),
      ],
    });
    const program = makeProgram([
      makeBlock({
        weeks: [
          makeWeek(1),
          makeWeek(2),
          makeWeek(3),
          makeWeek(4, { isDeload: true }),
        ],
        days: [makeDay({ name: 'Squat day', exercises: [squat] })],
      }),
    ]);
    const states = statesMap(
      makeState({ progressionKey: 'squat', exerciseId: 1, trainingMax: 100 }),
    );

    const weights = (weekIndex: number) =>
      resolveDay(
        program,
        { cycle: 1, weekIndex, dayIndex: 1 },
        states,
      )!.exercises[0].sets.map((s) => s.weight);
    expect(weights(1)).toEqual([65, 75, 85]);
    expect(weights(2)).toEqual([70, 80, 90]);
    expect(weights(3)).toEqual([75, 85, 95]);
    expect(weights(4)).toEqual([40, 50, 60]);

    const deload = resolveDay(
      program,
      { cycle: 1, weekIndex: 4, dayIndex: 1 },
      states,
    )!;
    expect(deload.isDeload).toBe(true);
    expect(deload.exercises[0].sets.every((s) => !s.isAmrap)).toBe(true);
    expect(
      resolveDay(program, { cycle: 1, weekIndex: 3, dayIndex: 1 }, states)!
        .exercises[0].sets[2].isAmrap,
    ).toBe(true);
  });

  it('respects the state rounding increment over the exercise default', () => {
    const exercise = makeExercise({
      progressionKey: 'db-press',
      progression: { strategy: 'LINEAR', incrementKg: 2 },
      roundingKg: 2,
      sets: makeSets(3, { repsMin: 10, percent: 90 }),
    });
    const program = makeProgram([
      makeBlock({ days: [makeDay({ exercises: [exercise] })] }),
    ]);

    const byExercise = resolveDay(
      program,
      { cycle: 1, weekIndex: 1, dayIndex: 1 },
      statesMap(makeState({ progressionKey: 'db-press', workingWeight: 25 })),
    )!;
    expect(byExercise.exercises[0].sets[0].weight).toBe(22); // 22.5 -> nearest 2

    const byState = resolveDay(
      program,
      { cycle: 1, weekIndex: 1, dayIndex: 1 },
      statesMap(
        makeState({
          progressionKey: 'db-press',
          workingWeight: 25,
          roundingKg: 1,
        }),
      ),
    )!;
    expect(byState.exercises[0].sets[0].weight).toBe(23); // 22.5 -> nearest 1 (round half up)
  });
});
