import {
  makeExercise,
  makeSet,
  makeState,
  makeWeek,
  resetFixtureIds,
} from '../testing/fixtures';
import { NoneParams, StrategyContext } from '../types';
import { noneStrategy } from './none';

const ctx: StrategyContext = {
  position: { cycle: 1, weekIndex: 1, dayIndex: 1 },
  blockIndex: 0,
  weekInBlock: 1,
  week: makeWeek(1),
  rounding: 2.5,
};

describe('noneStrategy', () => {
  beforeEach(resetFixtureIds);

  it('uses fixed weights from the rows', () => {
    const params: NoneParams = { strategy: 'NONE' };
    const exercise = makeExercise({
      progression: params,
      sets: [makeSet({ repsMin: 10, weight: 20 })],
    });
    const state = makeState({ progressionKey: exercise.progressionKey });
    const [set] = noneStrategy.resolve({
      exercise,
      sets: exercise.sets,
      params,
      state,
      ctx,
    });
    expect(set).toMatchObject({ weight: 20, basis: 'FIXED' });
  });

  it('follows the shared key working weight or training max by percentage', () => {
    const ww: NoneParams = { strategy: 'NONE', basis: 'WORKING_WEIGHT' };
    const exercise = makeExercise({
      progression: ww,
      sets: [makeSet({ repsMin: 5, percent: 90 })],
    });
    const state = makeState({
      progressionKey: exercise.progressionKey,
      workingWeight: 100,
      trainingMax: 80,
    });
    expect(
      noneStrategy.resolve({
        exercise,
        sets: exercise.sets,
        params: ww,
        state,
        ctx,
      })[0].weight,
    ).toBe(90);

    const tm: NoneParams = { strategy: 'NONE', basis: 'TRAINING_MAX' };
    expect(
      noneStrategy.resolve({
        exercise,
        sets: exercise.sets,
        params: tm,
        state,
        ctx,
      })[0],
    ).toMatchObject({
      weight: 72.5,
      basis: 'TRAINING_MAX',
    });
  });

  it('never changes state', () => {
    const params: NoneParams = { strategy: 'NONE' };
    const exercise = makeExercise({ progression: params });
    const state = makeState({
      progressionKey: exercise.progressionKey,
      workingWeight: 100,
    });
    expect(
      noneStrategy.apply({ exercise, params, state, results: [], ctx }),
    ).toEqual({ state });
  });
});
