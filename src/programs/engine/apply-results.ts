import { contextFor, defaultState, roundingFor } from './resolve-day';
import { findDay } from './schedule';
import { getStrategy, paramsFor } from './strategies';
import { isWorkingRow } from './strategies/shared';
import {
  ExerciseState,
  Position,
  ProgramSnapshot,
  ProgressionEvent,
  SetResult,
  SnapshotDay,
  SnapshotExercise,
} from './types';

export type ApplyOutcome = {
  states: Map<string, ExerciseState>;
  events: ProgressionEvent[];
  /** Keys whose state changed and must be persisted. */
  changedKeys: string[];
};

/** programSetId -> owning slot, for every set row of the day. */
export function indexSetsBySlot(
  day: SnapshotDay,
): Map<number, SnapshotExercise> {
  const index = new Map<number, SnapshotExercise>();
  for (const exercise of day.exercises) {
    for (const set of exercise.sets) index.set(set.id, exercise);
  }
  return index;
}

function statesDiffer(a: ExerciseState, b: ExerciseState): boolean {
  return (
    a.exerciseId !== b.exerciseId ||
    a.workingWeight !== b.workingWeight ||
    a.trainingMax !== b.trainingMax ||
    a.e1rm !== b.e1rm ||
    a.stageIndex !== b.stageIndex ||
    a.consecutiveFails !== b.consecutiveFails ||
    a.repsOffset !== b.repsOffset ||
    a.roundingKg !== b.roundingKg
  );
}

/**
 * Feeds a completed program workout back into the per-slot states. Only
 * program-generated working sets take part; user-added sets and warm-ups are
 * ignored, and a deload week never moves state. Slots sharing a key are
 * applied in day order, each seeing the state left by the previous one.
 */
export function applyResults(
  snapshot: ProgramSnapshot,
  position: Position,
  statesByKey: ReadonlyMap<string, ExerciseState>,
  results: SetResult[],
): ApplyOutcome {
  const states = new Map(statesByKey);
  const events: ProgressionEvent[] = [];
  const changedKeys: string[] = [];

  const found = findDay(snapshot, position);
  if (!found || found.location.week.isDeload) {
    return { states, events, changedKeys };
  }

  const slotIndex = indexSetsBySlot(found.day);
  const bySlot = new Map<number, SetResult[]>();
  for (const result of results) {
    if (!isWorkingRow(result)) continue;
    const slot = slotIndex.get(result.programSetId);
    if (!slot) continue;
    const list = bySlot.get(slot.id) ?? [];
    list.push(result);
    bySlot.set(slot.id, list);
  }

  const exercises = [...found.day.exercises].sort(
    (a, b) => a.exerciseOrder - b.exerciseOrder,
  );
  for (const exercise of exercises) {
    const slotResults = bySlot.get(exercise.id);
    if (!slotResults || slotResults.length === 0) continue;

    const params = paramsFor(exercise.strategy, exercise.progression);
    const strategy = getStrategy(params.strategy);
    const before =
      states.get(exercise.progressionKey) ?? defaultState(exercise);
    const ctx = contextFor(
      found.location,
      position,
      roundingFor(exercise, before),
    );
    const { state: after, event } = strategy.apply({
      exercise,
      params,
      state: before,
      results: slotResults,
      ctx,
    });
    if (statesDiffer(before, after) || !states.has(exercise.progressionKey)) {
      if (!changedKeys.includes(exercise.progressionKey)) {
        changedKeys.push(exercise.progressionKey);
      }
    }
    states.set(exercise.progressionKey, after);
    if (event) events.push(event);
  }

  return { states, events, changedKeys };
}

/**
 * Runs each strategy's cycle-end hook once per progression key (training max
 * bumps). Used when a cycle rolls over or the user starts the next one.
 */
export function applyCycleEnd(
  snapshot: ProgramSnapshot,
  statesByKey: ReadonlyMap<string, ExerciseState>,
): ApplyOutcome {
  const states = new Map(statesByKey);
  const events: ProgressionEvent[] = [];
  const changedKeys: string[] = [];
  const seen = new Set<string>();

  for (const block of snapshot.blocks) {
    for (const day of block.days) {
      for (const exercise of day.exercises) {
        if (seen.has(exercise.progressionKey)) continue;
        const params = paramsFor(exercise.strategy, exercise.progression);
        const strategy = getStrategy(params.strategy);
        if (!strategy.onCycleEnd) continue;
        seen.add(exercise.progressionKey);
        const before =
          states.get(exercise.progressionKey) ?? defaultState(exercise);
        const { state: after, event } = strategy.onCycleEnd({
          exercise,
          params,
          state: before,
          rounding: roundingFor(exercise, before),
        });
        if (statesDiffer(before, after)) {
          changedKeys.push(exercise.progressionKey);
          states.set(exercise.progressionKey, after);
        }
        if (event) events.push(event);
      }
    }
  }
  return { states, events, changedKeys };
}
