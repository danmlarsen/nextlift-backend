import {
  makeExercise,
  makeResult,
  makeResults,
  makeSets,
  makeState,
  makeWeek,
  resetFixtureIds,
} from '../testing/fixtures';
import { DoubleParams, StrategyContext } from '../types';
import { doubleStrategy } from './double';

const ctx: StrategyContext = {
  position: { cycle: 1, weekIndex: 1, dayIndex: 1 },
  blockIndex: 0,
  weekInBlock: 1,
  week: makeWeek(1),
  rounding: 2.5,
};

describe('doubleStrategy', () => {
  beforeEach(resetFixtureIds);

  describe('LOAD mode', () => {
    const params: DoubleParams = { strategy: 'DOUBLE', incrementKg: 2.5 };
    const exercise = makeExercise({
      progression: params,
      sets: makeSets(3, { repsMin: 8, repsMax: 12 }),
    });
    const state = makeState({
      progressionKey: exercise.progressionKey,
      workingWeight: 40,
    });
    const sets = doubleStrategy.resolve({
      exercise,
      sets: exercise.sets,
      params,
      state,
      ctx,
    });

    it('prescribes the range at the working weight', () => {
      expect(sets.map((s) => [s.repsMin, s.repsMax, s.weight])).toEqual([
        [8, 12, 40],
        [8, 12, 40],
        [8, 12, 40],
      ]);
    });

    it('adds weight once every set reaches the top of the range', () => {
      const out = doubleStrategy.apply({
        exercise,
        params,
        state,
        results: makeResults(sets, { reps: 12 }),
        ctx,
      });
      expect(out.state.workingWeight).toBe(42.5);
      expect(out.event?.kind).toBe('INCREMENT');
    });

    it('holds inside the range', () => {
      const results = [
        makeResult(sets[0], { reps: 12 }),
        makeResult(sets[1], { reps: 10 }),
        makeResult(sets[2], { reps: 9 }),
      ];
      const out = doubleStrategy.apply({
        exercise,
        params,
        state: { ...state, consecutiveFails: 1 },
        results,
        ctx,
      });
      expect(out.state).toMatchObject({
        workingWeight: 40,
        consecutiveFails: 0,
      });
      expect(out.event?.kind).toBe('HOLD');
    });

    it('drops the load after two sessions below the range', () => {
      const results = makeResults(sets, { reps: 6 });
      const first = doubleStrategy.apply({
        exercise,
        params,
        state,
        results,
        ctx,
      });
      expect(first.state).toMatchObject({
        workingWeight: 40,
        consecutiveFails: 1,
      });
      expect(first.event?.kind).toBe('FAIL');

      const second = doubleStrategy.apply({
        exercise,
        params,
        state: first.state,
        results,
        ctx,
      });
      expect(second.state).toMatchObject({
        workingWeight: 37.5,
        consecutiveFails: 0,
      });
      expect(second.event?.kind).toBe('DECREMENT');
    });

    it('seeds the working weight when none is known', () => {
      const empty = makeState({ progressionKey: exercise.progressionKey });
      const resolved = doubleStrategy.resolve({
        exercise,
        sets: exercise.sets,
        params,
        state: empty,
        ctx,
      });
      expect(resolved.every((s) => s.weight === null)).toBe(true);

      const out = doubleStrategy.apply({
        exercise,
        params,
        state: empty,
        results: makeResults(resolved, { reps: 10, weight: 22 }),
        ctx,
      });
      expect(out.state.workingWeight).toBe(22.5);
      expect(out.event?.kind).toBe('SEED');
    });
  });

  describe('REPS mode (bodyweight)', () => {
    const params: DoubleParams = {
      strategy: 'DOUBLE',
      incrementKg: 0,
      mode: 'REPS',
      repsStep: 2,
    };
    const exercise = makeExercise({
      progression: params,
      sets: makeSets(3, { repsMin: 8, repsMax: 12 }),
    });

    it('widens the range by the offset and never prescribes a load', () => {
      const state = makeState({
        progressionKey: exercise.progressionKey,
        repsOffset: 4,
      });
      const sets = doubleStrategy.resolve({
        exercise,
        sets: exercise.sets,
        params,
        state,
        ctx,
      });
      expect(sets.map((s) => [s.repsMin, s.repsMax, s.weight])).toEqual([
        [12, 16, null],
        [12, 16, null],
        [12, 16, null],
      ]);
    });

    it('moves the range up when the top is reached', () => {
      const state = makeState({ progressionKey: exercise.progressionKey });
      const sets = doubleStrategy.resolve({
        exercise,
        sets: exercise.sets,
        params,
        state,
        ctx,
      });
      const out = doubleStrategy.apply({
        exercise,
        params,
        state,
        results: makeResults(sets, { reps: 12 }),
        ctx,
      });
      expect(out.state.repsOffset).toBe(2);
      expect(out.event?.kind).toBe('REPS_INCREMENT');

      const hold = doubleStrategy.apply({
        exercise,
        params,
        state,
        results: makeResults(sets, { reps: 9 }),
        ctx,
      });
      expect(hold.state.repsOffset).toBe(0);
      expect(hold.event).toBeUndefined();
    });
  });
});
