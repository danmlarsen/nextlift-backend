import {
  makeExercise,
  makeResult,
  makeResults,
  makeSet,
  makeSets,
  makeState,
  makeWeek,
  resetFixtureIds,
} from '../testing/fixtures';
import { RpeParams, StrategyContext } from '../types';
import { rpeStrategy } from './rpe';

const ctxForWeek = (weekInBlock: number): StrategyContext => ({
  position: { cycle: 1, weekIndex: weekInBlock, dayIndex: 1 },
  blockIndex: 0,
  weekInBlock,
  week: makeWeek(weekInBlock),
  rounding: 2.5,
});

describe('rpeStrategy', () => {
  beforeEach(resetFixtureIds);

  describe('TOP_SET_BACKOFF', () => {
    const params: RpeParams = {
      strategy: 'RPE',
      mode: 'TOP_SET_BACKOFF',
      backoffPercent: 90,
      backoffSets: 3,
    };

    it('suggests the top set from the estimated 1RM and back-offs from the top set', () => {
      const exercise = makeExercise({
        progression: params,
        sets: [
          makeSet({ setOrder: 1, repsMin: 5, repsMax: 5, targetRpe: 8 }),
          makeSet({ setOrder: 2, repsMin: 5, repsMax: 5, percent: 90 }),
          makeSet({ setOrder: 3, repsMin: 5, repsMax: 5, percent: 85 }),
        ],
      });
      const state = makeState({
        progressionKey: exercise.progressionKey,
        e1rm: 120,
      });
      const sets = rpeStrategy.resolve({
        exercise,
        sets: exercise.sets,
        params,
        state,
        ctx: ctxForWeek(1),
      });
      // 5 @ 8 = 81.1 % of 120 = 97.32 -> 97.5; 90 % of 97.5 = 87.75 -> 87.5; 85 % = 82.875 -> 82.5
      expect(sets.map((s) => s.weight)).toEqual([97.5, 87.5, 82.5]);
      expect(sets[0]).toMatchObject({ targetRpe: 8, basis: 'E1RM' });
    });

    it('synthesizes back-off sets when only the top set is described', () => {
      const exercise = makeExercise({
        progression: params,
        sets: [makeSet({ setOrder: 1, repsMin: 3, targetRpe: 9 })],
      });
      const state = makeState({
        progressionKey: exercise.progressionKey,
        e1rm: 100,
      });
      const sets = rpeStrategy.resolve({
        exercise,
        sets: exercise.sets,
        params,
        state,
        ctx: ctxForWeek(1),
      });
      // 3 @ 9 = 89.2 -> 90; 90 % of 90 = 81 -> 80
      expect(sets.map((s) => s.weight)).toEqual([90, 80, 80, 80]);
      expect(sets.map((s) => s.setOrder)).toEqual([1, 2, 3, 4]);
      expect(
        sets.slice(1).every((s) => s.programSetId === sets[0].programSetId),
      ).toBe(true);
    });

    it('leaves loads empty without an estimated 1RM', () => {
      const exercise = makeExercise({
        progression: params,
        sets: [makeSet({ setOrder: 1, repsMin: 5, targetRpe: 8 })],
      });
      const state = makeState({ progressionKey: exercise.progressionKey });
      const sets = rpeStrategy.resolve({
        exercise,
        sets: exercise.sets,
        params,
        state,
        ctx: ctxForWeek(1),
      });
      expect(sets.every((s) => s.weight === null)).toBe(true);
    });

    it('re-estimates the 1RM from sets logged with an RPE and ignores sets without', () => {
      const exercise = makeExercise({
        progression: params,
        sets: [makeSet({ setOrder: 1, repsMin: 5, targetRpe: 8 })],
      });
      const state = makeState({
        progressionKey: exercise.progressionKey,
        e1rm: 120,
      });
      const sets = rpeStrategy.resolve({
        exercise,
        sets: exercise.sets,
        params,
        state,
        ctx: ctxForWeek(1),
      });

      const logged = [makeResult(sets[0], { weight: 100, reps: 5, rpe: 8 })];
      const out = rpeStrategy.apply({
        exercise,
        params,
        state,
        results: logged,
        ctx: ctxForWeek(1),
      });
      // 100 / 0.811 = 123.3
      expect(out.state.e1rm).toBeCloseTo(123.3, 1);
      expect(out.event?.kind).toBe('E1RM_UPDATE');

      const silent = [makeResult(sets[0], { weight: 100, reps: 5 })];
      expect(
        rpeStrategy.apply({
          exercise,
          params,
          state,
          results: silent,
          ctx: ctxForWeek(1),
        }),
      ).toEqual({ state });
    });
  });

  describe('RIR_MESOCYCLE', () => {
    const params: RpeParams = {
      strategy: 'RPE',
      mode: 'RIR_MESOCYCLE',
      startRir: 3,
      endRir: 0,
      addSetsPerWeek: 1,
      maxSets: 5,
      incrementKg: 2.5,
    };
    const exercise = makeExercise({
      progression: params,
      sets: makeSets(3, { repsMin: 8, repsMax: 12 }),
    });

    it.each([
      [1, 3, 7],
      [2, 4, 8],
      [3, 5, 9],
      [4, 5, 10],
      [5, 5, 10],
    ])('week %s prescribes %s sets at RPE %s', (week, count, rpe) => {
      const state = makeState({
        progressionKey: exercise.progressionKey,
        workingWeight: 40,
      });
      const sets = rpeStrategy.resolve({
        exercise,
        sets: exercise.sets,
        params,
        state,
        ctx: ctxForWeek(week),
      });
      expect(sets).toHaveLength(count);
      expect(sets.every((s) => s.targetRpe === rpe && s.weight === 40)).toBe(
        true,
      );
    });

    it('falls back to the estimated 1RM for the load when no working weight exists', () => {
      const state = makeState({
        progressionKey: exercise.progressionKey,
        e1rm: 100,
      });
      const sets = rpeStrategy.resolve({
        exercise,
        sets: exercise.sets,
        params,
        state,
        ctx: ctxForWeek(1),
      });
      // 12 reps @ RPE 7 -> 15 total reps -> 59.9 % -> 60
      expect(sets[0]).toMatchObject({ weight: 60, basis: 'E1RM' });
    });

    it('adds load when the whole range is reached at or under the target effort', () => {
      const state = makeState({
        progressionKey: exercise.progressionKey,
        workingWeight: 40,
      });
      const sets = rpeStrategy.resolve({
        exercise,
        sets: exercise.sets,
        params,
        state,
        ctx: ctxForWeek(1),
      });

      const hit = rpeStrategy.apply({
        exercise,
        params,
        state,
        results: makeResults(sets, { reps: 12, rpe: 7 }),
        ctx: ctxForWeek(1),
      });
      expect(hit.state.workingWeight).toBe(42.5);
      expect(hit.event?.kind).toBe('INCREMENT');

      const tooHard = rpeStrategy.apply({
        exercise,
        params,
        state,
        results: makeResults(sets, { reps: 12, rpe: 9 }),
        ctx: ctxForWeek(1),
      });
      expect(tooHard.state.workingWeight).toBe(40);

      const short = rpeStrategy.apply({
        exercise,
        params,
        state,
        results: makeResults(sets, { reps: 10 }),
        ctx: ctxForWeek(1),
      });
      expect(short.state.workingWeight).toBe(40);
      expect(short.event?.kind).toBe('HOLD');
    });

    it('seeds the working weight from the first session', () => {
      const state = makeState({ progressionKey: exercise.progressionKey });
      const sets = rpeStrategy.resolve({
        exercise,
        sets: exercise.sets,
        params,
        state,
        ctx: ctxForWeek(1),
      });
      const out = rpeStrategy.apply({
        exercise,
        params,
        state,
        results: makeResults(sets, { reps: 10, weight: 30 }),
        ctx: ctxForWeek(1),
      });
      expect(out.state.workingWeight).toBe(30);
      expect(out.event?.kind).toBe('SEED');
    });
  });
});
