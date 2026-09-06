import {
  GZCLP_T1,
  GZCLP_T3,
  makeExercise,
  makeResult,
  makeResults,
  makeSet,
  makeSets,
  makeState,
  makeWeek,
  resetFixtureIds,
} from '../testing/fixtures';
import { LinearParams, StrategyContext } from '../types';
import { linearStrategy } from './linear';

const ctx: StrategyContext = {
  position: { cycle: 1, weekIndex: 1, dayIndex: 1 },
  blockIndex: 0,
  weekInBlock: 1,
  week: makeWeek(1),
  rounding: 2.5,
};

const plain: LinearParams = { strategy: 'LINEAR', incrementKg: 2.5 };

describe('linearStrategy', () => {
  beforeEach(resetFixtureIds);

  describe('resolve', () => {
    it('prescribes the working weight for every working set', () => {
      const exercise = makeExercise({
        progression: plain,
        sets: makeSets(3, { repsMin: 5, repsMax: 5 }),
      });
      const state = makeState({
        progressionKey: exercise.progressionKey,
        workingWeight: 100,
      });

      const sets = linearStrategy.resolve({
        exercise,
        sets: exercise.sets,
        params: plain,
        state,
        ctx,
      });

      expect(sets.map((s) => s.weight)).toEqual([100, 100, 100]);
      expect(sets.map((s) => s.repsMin)).toEqual([5, 5, 5]);
      expect(sets.map((s) => s.setOrder)).toEqual([1, 2, 3]);
      expect(sets[0].basis).toBe('WORKING_WEIGHT');
    });

    it('leaves loads empty until a working weight exists', () => {
      const exercise = makeExercise({
        progression: plain,
        sets: makeSets(2, { repsMin: 5 }),
      });
      const state = makeState({ progressionKey: exercise.progressionKey });

      const sets = linearStrategy.resolve({
        exercise,
        sets: exercise.sets,
        params: plain,
        state,
        ctx,
      });

      expect(sets.map((s) => s.weight)).toEqual([null, null]);
    });

    it('resolves warm-ups as a percentage of the working weight', () => {
      const exercise = makeExercise({
        progression: plain,
        sets: [
          makeSet({ setOrder: 1, type: 'warmup', repsMin: 5, percent: 50 }),
          makeSet({ setOrder: 2, repsMin: 5 }),
        ],
      });
      const state = makeState({
        progressionKey: exercise.progressionKey,
        workingWeight: 102.5,
      });

      const sets = linearStrategy.resolve({
        exercise,
        sets: exercise.sets,
        params: plain,
        state,
        ctx,
      });

      expect(sets[0]).toMatchObject({ type: 'warmup', weight: 52.5 });
      expect(sets[1].weight).toBe(102.5);
    });

    it('generates the current stage for staged (GZCLP) slots', () => {
      const params = GZCLP_T1(5);
      const exercise = makeExercise({
        progression: params,
        restSeconds: 180,
        sets: makeSets(5, { repsMin: 3, repsMax: 3 }, { amrapLast: true }),
      });
      const stage0 = linearStrategy.resolve({
        exercise,
        sets: exercise.sets,
        params: params as LinearParams,
        state: makeState({
          progressionKey: exercise.progressionKey,
          workingWeight: 60,
        }),
        ctx,
      });
      expect(stage0).toHaveLength(5);
      expect(stage0.map((s) => s.repsMin)).toEqual([3, 3, 3, 3, 3]);
      expect(stage0.map((s) => s.isAmrap)).toEqual([
        false,
        false,
        false,
        false,
        true,
      ]);
      expect(
        stage0.every((s) => s.weight === 60 && s.restSeconds === 180),
      ).toBe(true);

      const stage1 = linearStrategy.resolve({
        exercise,
        sets: exercise.sets,
        params: params as LinearParams,
        state: makeState({
          progressionKey: exercise.progressionKey,
          workingWeight: 60,
          stageIndex: 1,
        }),
        ctx,
      });
      expect(stage1).toHaveLength(6);
      expect(stage1.map((s) => s.repsMin)).toEqual([2, 2, 2, 2, 2, 2]);
      expect(stage1[5].isAmrap).toBe(true);
    });
  });

  describe('apply', () => {
    const exercise = makeExercise({
      progression: plain,
      sets: makeSets(3, { repsMin: 5, repsMax: 5 }),
    });
    const resolve = (
      state = makeState({
        progressionKey: exercise.progressionKey,
        workingWeight: 100,
      }),
    ) =>
      linearStrategy.resolve({
        exercise,
        sets: exercise.sets,
        params: plain,
        state,
        ctx,
      });

    it('seeds the working weight from the first logged session', () => {
      const state = makeState({ progressionKey: exercise.progressionKey });
      const sets = resolve(state);
      const results = makeResults(sets, { weight: 61.2 });

      const out = linearStrategy.apply({
        exercise,
        params: plain,
        state,
        results,
        ctx,
      });

      expect(out.state.workingWeight).toBe(60);
      expect(out.event?.kind).toBe('SEED');
    });

    it('adds the increment when every prescribed set is hit', () => {
      const state = makeState({
        progressionKey: exercise.progressionKey,
        workingWeight: 100,
        consecutiveFails: 2,
      });
      const results = makeResults(resolve(state));

      const out = linearStrategy.apply({
        exercise,
        params: plain,
        state,
        results,
        ctx,
      });

      expect(out.state).toMatchObject({
        workingWeight: 102.5,
        consecutiveFails: 0,
      });
      expect(out.event).toMatchObject({
        kind: 'INCREMENT',
        from: 100,
        to: 102.5,
      });
    });

    it.each([
      ['a set below target reps', { reps: 4 }],
      ['an uncompleted set', { completed: false }],
      ['a lighter load than prescribed', { weight: 97.5 }],
    ])('counts %s as a failed session', (_label, actual) => {
      const state = makeState({
        progressionKey: exercise.progressionKey,
        workingWeight: 100,
      });
      const sets = resolve(state);
      const results = [
        makeResult(sets[0]),
        makeResult(sets[1]),
        makeResult(sets[2], actual),
      ];

      const out = linearStrategy.apply({
        exercise,
        params: plain,
        state,
        results,
        ctx,
      });

      expect(out.state).toMatchObject({
        workingWeight: 100,
        consecutiveFails: 1,
      });
      expect(out.event?.kind).toBe('FAIL');
    });

    it('takes 10 % off after the third consecutive failure', () => {
      const state = makeState({
        progressionKey: exercise.progressionKey,
        workingWeight: 100,
        consecutiveFails: 2,
      });
      const results = makeResults(resolve(state), { reps: 3 });

      const out = linearStrategy.apply({
        exercise,
        params: plain,
        state,
        results,
        ctx,
      });

      expect(out.state).toMatchObject({
        workingWeight: 90,
        consecutiveFails: 0,
        stageIndex: 0,
      });
      expect(out.event).toMatchObject({ kind: 'RESET', from: 100, to: 90 });
    });

    it('does nothing without prescribed working sets', () => {
      const state = makeState({
        progressionKey: exercise.progressionKey,
        workingWeight: 100,
      });
      expect(
        linearStrategy.apply({
          exercise,
          params: plain,
          state,
          results: [],
          ctx,
        }),
      ).toEqual({ state });
    });
  });

  describe('staged fallback (GZCLP T1)', () => {
    const params = GZCLP_T1(5) as LinearParams;
    const exercise = makeExercise({
      progression: params,
      sets: makeSets(5, { repsMin: 3, repsMax: 3 }, { amrapLast: true }),
    });

    const fail = (state: ReturnType<typeof makeState>) => {
      const sets = linearStrategy.resolve({
        exercise,
        sets: exercise.sets,
        params,
        state,
        ctx,
      });
      const results = sets.map((set, index) =>
        makeResult(
          set,
          index === sets.length - 1 ? { completed: false, reps: 0 } : {},
        ),
      );
      return linearStrategy.apply({ exercise, params, state, results, ctx });
    };

    it('walks 5x3+ -> 6x2+ -> 10x1+ at the same weight, then resets to 85 %', () => {
      const initial = makeState({
        progressionKey: exercise.progressionKey,
        workingWeight: 65,
      });

      const first = fail(initial);
      expect(first.state).toMatchObject({
        workingWeight: 65,
        stageIndex: 1,
        consecutiveFails: 0,
      });
      expect(first.event?.kind).toBe('STAGE_ADVANCE');

      const second = fail(first.state);
      expect(second.state).toMatchObject({ workingWeight: 65, stageIndex: 2 });

      const third = fail(second.state);
      expect(third.state).toMatchObject({
        workingWeight: 55,
        stageIndex: 0,
        consecutiveFails: 0,
      });
      expect(third.event).toMatchObject({ kind: 'RESET', from: 65, to: 55 });
    });

    it('keeps adding the increment while the stage is completed', () => {
      const state = makeState({
        progressionKey: exercise.progressionKey,
        workingWeight: 60,
        stageIndex: 1,
      });
      const sets = linearStrategy.resolve({
        exercise,
        sets: exercise.sets,
        params,
        state,
        ctx,
      });

      const out = linearStrategy.apply({
        exercise,
        params,
        state,
        results: makeResults(sets),
        ctx,
      });

      expect(out.state).toMatchObject({ workingWeight: 65, stageIndex: 1 });
    });
  });

  describe('AMRAP threshold (GZCLP T3)', () => {
    const params = GZCLP_T3 as LinearParams;
    const exercise = makeExercise({
      progression: params,
      sets: makeSets(3, { repsMin: 15, repsMax: 15 }, { amrapLast: true }),
    });
    const state = makeState({
      progressionKey: exercise.progressionKey,
      workingWeight: 30,
    });
    const sets = linearStrategy.resolve({
      exercise,
      sets: exercise.sets,
      params,
      state,
      ctx,
    });

    it('progresses only when the AMRAP set reaches the threshold', () => {
      const hit = sets.map((set) =>
        makeResult(set, set.isAmrap ? { reps: 25 } : {}),
      );
      expect(
        linearStrategy.apply({ exercise, params, state, results: hit, ctx })
          .state.workingWeight,
      ).toBe(32.5);

      const miss = sets.map((set) =>
        makeResult(set, set.isAmrap ? { reps: 20 } : {}),
      );
      const out = linearStrategy.apply({
        exercise,
        params,
        state,
        results: miss,
        ctx,
      });
      expect(out.state).toMatchObject({
        workingWeight: 30,
        consecutiveFails: 0,
      });
      expect(out.event?.kind).toBe('HOLD');
    });
  });
});
