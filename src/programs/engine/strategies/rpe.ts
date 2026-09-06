import { roundLoad, roundToIncrement } from '../rounding';
import { estimateOneRepMaxFromRpe, loadForRpe, rpeFromRir } from '../rts-table';
import {
  ExerciseState,
  ProgressionEvent,
  ResolvedSet,
  RpeParams,
  SetResult,
  SnapshotExercise,
  SnapshotSet,
  Strategy,
  StrategyContext,
} from '../types';
import {
  allPrescribedHit,
  formatKg,
  isWorkingRow,
  makeEvent,
  maxCompletedWeight,
  renumber,
  resolveWarmups,
  toResolvedSet,
} from './shared';

const E1RM_CHANGE_THRESHOLD = 0.5;

function targetRirForWeek(
  params: Extract<RpeParams, { mode: 'RIR_MESOCYCLE' }>,
  weekInBlock: number,
): number {
  return Math.max(params.endRir, params.startRir - (weekInBlock - 1));
}

function resolveTopSetBackoff(
  exercise: SnapshotExercise,
  rows: SnapshotSet[],
  params: Extract<RpeParams, { mode: 'TOP_SET_BACKOFF' }>,
  state: ExerciseState,
  ctx: StrategyContext,
): ResolvedSet[] {
  const working = rows.filter(isWorkingRow);
  if (working.length === 0) return [];
  const top = working[0];
  const topReps = top.repsMin ?? top.repsMax ?? 1;
  const topLoad =
    state.e1rm !== null && top.targetRpe !== null
      ? roundLoad(loadForRpe(state.e1rm, topReps, top.targetRpe), ctx.rounding)
      : null;
  const resolvedTop = toResolvedSet(top, exercise, {
    weight: topLoad,
    basis: 'E1RM',
  });

  const backoffRows = working.slice(1);
  const backoffLoad = (percent: number | null) =>
    topLoad === null
      ? null
      : roundLoad(
          topLoad * ((percent ?? params.backoffPercent) / 100),
          ctx.rounding,
        );

  const backoffs =
    backoffRows.length > 0
      ? backoffRows.map((row) =>
          toResolvedSet(row, exercise, {
            weight: backoffLoad(row.percent),
            basis: 'E1RM',
          }),
        )
      : Array.from({ length: params.backoffSets }, () =>
          toResolvedSet(top, exercise, {
            isAmrap: false,
            weight: backoffLoad(null),
            percent: params.backoffPercent,
            basis: 'E1RM',
          }),
        );
  return [resolvedTop, ...backoffs];
}

function resolveMesocycle(
  exercise: SnapshotExercise,
  rows: SnapshotSet[],
  params: Extract<RpeParams, { mode: 'RIR_MESOCYCLE' }>,
  state: ExerciseState,
  ctx: StrategyContext,
): ResolvedSet[] {
  const working = rows.filter(isWorkingRow);
  if (working.length === 0) return [];
  const targetRpe = rpeFromRir(targetRirForWeek(params, ctx.weekInBlock));
  const count = Math.min(
    params.maxSets,
    working.length + (ctx.weekInBlock - 1) * params.addSetsPerWeek,
  );
  const last = working[working.length - 1];
  const templates = Array.from(
    { length: Math.max(count, working.length) },
    (_, index) => working[index] ?? last,
  ).slice(0, count);

  return templates.map((row) => {
    const reps = row.repsMax ?? row.repsMin ?? 8;
    const weight =
      state.workingWeight !== null
        ? roundLoad(
            state.workingWeight * ((row.percent ?? 100) / 100),
            ctx.rounding,
          )
        : state.e1rm !== null
          ? roundLoad(loadForRpe(state.e1rm, reps, targetRpe), ctx.rounding)
          : null;
    return toResolvedSet(row, exercise, {
      targetRpe,
      weight,
      basis: state.workingWeight !== null ? 'WORKING_WEIGHT' : 'E1RM',
    });
  });
}

/** New e1RM implied by the logged RPEs, or null when nothing was logged. */
function estimateFromResults(results: SetResult[]): number | null {
  let best: number | null = null;
  for (const result of results) {
    if (
      !result.completed ||
      !result.weight ||
      !result.reps ||
      result.rpe === null
    ) {
      continue;
    }
    const estimate = estimateOneRepMaxFromRpe(
      result.weight,
      result.reps,
      result.rpe,
    );
    if (best === null || estimate > best) best = estimate;
  }
  return best;
}

function updateE1rm(
  exercise: SnapshotExercise,
  state: ExerciseState,
  results: SetResult[],
): { state: ExerciseState; event?: ProgressionEvent } {
  const estimate = estimateFromResults(results);
  if (estimate === null) return { state };
  if (
    state.e1rm !== null &&
    Math.abs(estimate - state.e1rm) < E1RM_CHANGE_THRESHOLD
  ) {
    return { state };
  }
  const rounded = Number(estimate.toFixed(2));
  return {
    state: { ...state, e1rm: rounded },
    event: makeEvent(
      exercise,
      state,
      'E1RM_UPDATE',
      state.e1rm,
      rounded,
      `Estimated 1RM ${state.e1rm === null ? 'set to' : '→'} ${formatKg(rounded)}`,
    ),
  };
}

/**
 * RPE-driven prescriptions. TOP_SET_BACKOFF: a top set at reps @ RPE with
 * back-offs, loads suggested from the estimated 1RM and re-estimated from the
 * logged RPE. RIR_MESOCYCLE: target RIR falls and sets rise week by week,
 * with load progression when the whole range is reached under the target.
 */
export const rpeStrategy: Strategy<RpeParams> = {
  resolve({ exercise, sets, params, state, ctx }) {
    const working =
      params.mode === 'RIR_MESOCYCLE'
        ? resolveMesocycle(exercise, sets, params, state, ctx)
        : resolveTopSetBackoff(exercise, sets, params, state, ctx);
    const warmups = resolveWarmups(
      sets,
      exercise,
      working.find((set) => set.weight !== null)?.weight ?? null,
      'E1RM',
      ctx.rounding,
    );
    return renumber([...warmups, ...working]);
  },

  apply({ exercise, params, state, results, ctx }) {
    if (results.length === 0) return { state };

    const e1rmUpdate = updateE1rm(exercise, state, results);
    let current = e1rmUpdate.state;
    if (params.mode === 'TOP_SET_BACKOFF') return e1rmUpdate;

    if (current.workingWeight === null) {
      const seed = maxCompletedWeight(results);
      if (seed === null) return e1rmUpdate;
      const workingWeight = roundToIncrement(seed, ctx.rounding);
      current = { ...current, workingWeight };
      return {
        state: current,
        event: makeEvent(
          exercise,
          state,
          'SEED',
          null,
          workingWeight,
          `Starting weight set to ${formatKg(workingWeight)}`,
        ),
      };
    }

    const underTarget = results.every(
      (result) =>
        result.rpe === null ||
        result.prescribed.targetRpe === null ||
        result.rpe <= result.prescribed.targetRpe,
    );
    if (allPrescribedHit(results, 'MAX') && underTarget) {
      const to = roundToIncrement(
        current.workingWeight + params.incrementKg,
        ctx.rounding,
      );
      return {
        state: { ...current, workingWeight: to },
        event: makeEvent(
          exercise,
          state,
          'INCREMENT',
          current.workingWeight,
          to,
          `${formatKg(current.workingWeight)} → ${formatKg(to)}`,
        ),
      };
    }
    return {
      state: current,
      event:
        e1rmUpdate.event ??
        makeEvent(
          exercise,
          state,
          'HOLD',
          current.workingWeight,
          current.workingWeight,
          `Keep ${formatKg(current.workingWeight)} and work up to the top of the range`,
        ),
    };
  },
};
