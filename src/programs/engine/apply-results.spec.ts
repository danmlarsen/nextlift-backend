import { applyCycleEnd, applyResults } from './apply-results';
import { resolveDay } from './resolve-day';
import {
  gzclpProgram,
  makeBlock,
  makeDay,
  makeExercise,
  makeProgram,
  makeResult,
  makeResults,
  makeSets,
  makeState,
  makeWeek,
  resetFixtureIds,
  statesMap,
} from './testing/fixtures';
import { ExerciseState, SetResult } from './types';

const position = { cycle: 1, weekIndex: 1, dayIndex: 1 };

describe('applyResults', () => {
  beforeEach(resetFixtureIds);

  const gzclpStates = () =>
    statesMap(
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

  it('progresses every slot from a fully completed GZCLP day', () => {
    const program = gzclpProgram();
    const states = gzclpStates();
    const day = resolveDay(program, position, states)!;
    const results: SetResult[] = [
      ...makeResults(day.exercises[0].sets),
      ...makeResults(day.exercises[1].sets),
      ...day.exercises[2].sets.map((set) =>
        makeResult(set, set.isAmrap ? { reps: 18 } : {}),
      ),
    ];

    const out = applyResults(program, position, states, results);

    expect(out.states.get('t1-squat')!.workingWeight).toBe(65);
    expect(out.states.get('t2-bench')!.workingWeight).toBe(42.5);
    expect(out.states.get('t3-lat-pulldown')!.workingWeight).toBe(30);
    expect(out.events.map((e) => [e.progressionKey, e.kind])).toEqual([
      ['t1-squat', 'INCREMENT'],
      ['t2-bench', 'INCREMENT'],
      ['t3-lat-pulldown', 'HOLD'],
    ]);
    expect(out.changedKeys).toEqual(['t1-squat', 't2-bench']);
  });

  it('walks the T1 stages and resets after the last one', () => {
    const program = gzclpProgram();
    let states = gzclpStates();
    const failT1 = () => {
      const day = resolveDay(program, position, states)!;
      const squat = day.exercises[0];
      const results = squat.sets.map((set, index) =>
        makeResult(
          set,
          index === squat.sets.length - 1 ? { reps: 0, completed: false } : {},
        ),
      );
      const out = applyResults(program, position, states, results);
      states = out.states;
      return out;
    };

    expect(failT1().states.get('t1-squat')).toMatchObject({
      stageIndex: 1,
      workingWeight: 60,
    });
    expect(
      resolveDay(program, position, states)!.exercises[0].sets,
    ).toHaveLength(6);
    expect(failT1().states.get('t1-squat')).toMatchObject({
      stageIndex: 2,
      workingWeight: 60,
    });
    expect(
      resolveDay(program, position, states)!.exercises[0].sets,
    ).toHaveLength(10);
    const reset = failT1();
    expect(reset.states.get('t1-squat')).toMatchObject({
      stageIndex: 0,
      workingWeight: 50,
    });
    expect(reset.events[0]).toMatchObject({ kind: 'RESET', from: 60, to: 50 });
  });

  it('ignores warm-ups, user-added sets and slots without results', () => {
    const program = gzclpProgram();
    const states = gzclpStates();
    const day = resolveDay(program, position, states)!;
    const results: SetResult[] = [
      ...makeResults(day.exercises[0].sets),
      { ...makeResult(day.exercises[0].sets[0], { reps: 1 }), type: 'warmup' },
      {
        ...makeResult(day.exercises[0].sets[0], { reps: 1 }),
        programSetId: 9999,
      },
    ];

    const out = applyResults(program, position, states, results);

    expect(out.states.get('t1-squat')!.workingWeight).toBe(65);
    expect(out.states.get('t2-bench')!.workingWeight).toBe(40);
    expect(out.changedKeys).toEqual(['t1-squat']);
  });

  it('never moves state on a deload week', () => {
    const exercise = makeExercise({
      progressionKey: 'squat',
      exerciseId: 1,
      progression: { strategy: 'LINEAR', incrementKg: 2.5 },
      sets: makeSets(3, { repsMin: 5 }),
    });
    const program = makeProgram([
      makeBlock({
        weeks: [makeWeek(1, { isDeload: true, volumeMultiplier: 0.5 })],
        days: [makeDay({ exercises: [exercise] })],
      }),
    ]);
    const states = statesMap(
      makeState({ progressionKey: 'squat', exerciseId: 1, workingWeight: 100 }),
    );
    const day = resolveDay(program, position, states)!;

    const out = applyResults(
      program,
      position,
      states,
      makeResults(day.exercises[0].sets),
    );

    expect(out.states.get('squat')!.workingWeight).toBe(100);
    expect(out.events).toEqual([]);
    expect(out.changedKeys).toEqual([]);
  });

  it('creates state for slots that had none', () => {
    const program = gzclpProgram();
    const day = resolveDay(program, position, new Map())!;
    const out = applyResults(
      program,
      position,
      new Map(),
      makeResults(day.exercises[1].sets, { weight: 40, reps: 10 }),
    );
    expect(out.states.get('t2-bench')).toMatchObject({ workingWeight: 40 });
    expect(out.changedKeys).toEqual(['t2-bench']);
  });
});

describe('applyCycleEnd', () => {
  beforeEach(resetFixtureIds);

  it('bumps each percentage training max once per key', () => {
    const main = (day: string) =>
      makeExercise({
        progressionKey: 'squat',
        exerciseId: 1,
        name: `Squat ${day}`,
        progression: { strategy: 'PERCENT_TM', tmIncrementKg: 5 },
        sets: makeSets(3, { repsMin: 5, percent: 70 }),
      });
    const supplemental = makeExercise({
      progressionKey: 'squat',
      exerciseId: 1,
      progression: { strategy: 'NONE', basis: 'TRAINING_MAX' },
      sets: makeSets(5, { repsMin: 5, percent: 65 }),
    });
    const bench = makeExercise({
      progressionKey: 'bench',
      exerciseId: 2,
      progression: { strategy: 'PERCENT_TM', tmIncrementKg: 2.5 },
      sets: makeSets(3, { repsMin: 5, percent: 70 }),
    });
    const program = makeProgram([
      makeBlock({
        weekCount: 3,
        days: [
          makeDay({ exercises: [main('A'), supplemental] }),
          makeDay({ exercises: [main('B'), bench] }),
        ],
      }),
    ]);
    const states = statesMap(
      makeState({ progressionKey: 'squat', exerciseId: 1, trainingMax: 100 }),
      makeState({ progressionKey: 'bench', exerciseId: 2, trainingMax: 80 }),
    );

    const out = applyCycleEnd(program, states);

    expect(out.states.get('squat')!.trainingMax).toBe(105);
    expect(out.states.get('bench')!.trainingMax).toBe(82.5);
    expect(out.changedKeys.sort()).toEqual(['bench', 'squat']);
    expect(out.events).toHaveLength(2);
  });

  it('leaves linear programs alone', () => {
    const program = gzclpProgram();
    const states: Map<string, ExerciseState> = statesMap(
      makeState({ progressionKey: 't1-squat', workingWeight: 60 }),
    );
    expect(applyCycleEnd(program, states)).toEqual({
      states,
      events: [],
      changedKeys: [],
    });
  });
});
