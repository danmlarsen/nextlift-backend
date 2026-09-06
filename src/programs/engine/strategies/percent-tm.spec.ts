import {
  makeExercise,
  makeResult,
  makeResults,
  makeSet,
  makeState,
  makeWeek,
  resetFixtureIds,
} from '../testing/fixtures';
import { PercentTmParams, StrategyContext } from '../types';
import { percentTmStrategy } from './percent-tm';

const ctx: StrategyContext = {
  position: { cycle: 1, weekIndex: 1, dayIndex: 1 },
  blockIndex: 0,
  weekInBlock: 1,
  week: makeWeek(1),
  rounding: 2.5,
};

const waveRows = (percents: number[], reps: number) =>
  percents.map((percent, index) =>
    makeSet({
      setOrder: index + 1,
      repsMin: reps,
      repsMax: reps,
      percent,
      isAmrap: index === percents.length - 1,
    }),
  );

describe('percentTmStrategy', () => {
  beforeEach(resetFixtureIds);

  const params: PercentTmParams = {
    strategy: 'PERCENT_TM',
    tmIncrementKg: 2.5,
  };

  it('resolves loads as percentages of the training max, rounded', () => {
    const exercise = makeExercise({
      progression: params,
      sets: waveRows([65, 75, 85], 5),
    });
    const state = makeState({
      progressionKey: exercise.progressionKey,
      trainingMax: 100,
    });
    expect(
      percentTmStrategy
        .resolve({ exercise, sets: exercise.sets, params, state, ctx })
        .map((s) => s.weight),
    ).toEqual([65, 75, 85]);

    const odd = makeState({
      progressionKey: exercise.progressionKey,
      trainingMax: 102.5,
    });
    expect(
      percentTmStrategy
        .resolve({ exercise, sets: exercise.sets, params, state: odd, ctx })
        .map((s) => s.weight),
    ).toEqual([67.5, 77.5, 87.5]);
  });

  it('marks the AMRAP set and carries the basis', () => {
    const exercise = makeExercise({
      progression: params,
      sets: waveRows([70, 80, 90], 3),
    });
    const state = makeState({
      progressionKey: exercise.progressionKey,
      trainingMax: 100,
    });
    const sets = percentTmStrategy.resolve({
      exercise,
      sets: exercise.sets,
      params,
      state,
      ctx,
    });
    expect(sets.map((s) => s.isAmrap)).toEqual([false, false, true]);
    expect(sets[0].basis).toBe('TRAINING_MAX');
  });

  it('keeps the training max during the cycle and bumps it at cycle end', () => {
    const exercise = makeExercise({
      progression: params,
      sets: waveRows([65, 75, 85], 5),
    });
    const state = makeState({
      progressionKey: exercise.progressionKey,
      trainingMax: 100,
    });
    const sets = percentTmStrategy.resolve({
      exercise,
      sets: exercise.sets,
      params,
      state,
      ctx,
    });

    expect(
      percentTmStrategy.apply({
        exercise,
        params,
        state,
        results: makeResults(sets, { reps: 8 }),
        ctx,
      }),
    ).toEqual({ state });

    const end = percentTmStrategy.onCycleEnd!({
      exercise,
      params,
      state,
      rounding: 2.5,
    });
    expect(end.state.trainingMax).toBe(102.5);
    expect(end.event).toMatchObject({
      kind: 'TM_INCREMENT',
      from: 100,
      to: 102.5,
    });
  });

  it('seeds the training max from the first logged session', () => {
    const exercise = makeExercise({
      progression: params,
      sets: waveRows([65, 75, 85], 5),
    });
    const state = makeState({ progressionKey: exercise.progressionKey });
    const sets = percentTmStrategy.resolve({
      exercise,
      sets: exercise.sets,
      params,
      state,
      ctx,
    });
    expect(sets.every((s) => s.weight === null)).toBe(true);

    const out = percentTmStrategy.apply({
      exercise,
      params,
      state,
      results: makeResults(sets, { reps: 5, weight: 100 }),
      ctx,
    });
    // Epley 100 x 5 = 116.67; 90 % = 105.0
    expect(out.state.trainingMax).toBe(105);
    expect(out.state.e1rm).toBeCloseTo(116.67, 2);
    expect(out.event?.kind).toBe('SEED');
  });

  describe('AMRAP-driven training max (nSuns style)', () => {
    const amrapParams: PercentTmParams = {
      strategy: 'PERCENT_TM',
      tmIncrementKg: 2.5,
      tmAdvance: 'AMRAP',
      amrapTmRule: [
        { minReps: 0, maxReps: 1, incrementKg: 0 },
        { minReps: 2, maxReps: 3, incrementKg: 2.5 },
        { minReps: 4, maxReps: 5, incrementKg: 5 },
        { minReps: 6, maxReps: null, incrementKg: 7.5 },
      ],
    };
    const exercise = makeExercise({
      progression: amrapParams,
      sets: waveRows([75, 85, 95], 1),
    });
    const state = makeState({
      progressionKey: exercise.progressionKey,
      trainingMax: 100,
    });
    const sets = percentTmStrategy.resolve({
      exercise,
      sets: exercise.sets,
      params: amrapParams,
      state,
      ctx,
    });

    it.each([
      [1, 100, 'HOLD'],
      [3, 102.5, 'TM_INCREMENT'],
      [5, 105, 'TM_INCREMENT'],
      [8, 107.5, 'TM_INCREMENT'],
    ])('%s reps on the top set -> TM %s (%s)', (reps, expected, kind) => {
      const results = sets.map((set) =>
        makeResult(set, set.isAmrap ? { reps } : {}),
      );
      const out = percentTmStrategy.apply({
        exercise,
        params: amrapParams,
        state,
        results,
        ctx,
      });
      expect(out.state.trainingMax).toBe(expected);
      expect(out.event?.kind).toBe(kind);
    });

    it('does not touch the training max at cycle end', () => {
      expect(
        percentTmStrategy.onCycleEnd!({
          exercise,
          params: amrapParams,
          state,
          rounding: 2.5,
        }),
      ).toEqual({ state });
    });
  });
});
