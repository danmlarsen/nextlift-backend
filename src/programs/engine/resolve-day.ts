import { DEFAULT_ROUNDING_KG, roundToIncrement } from './rounding';
import { findDay } from './schedule';
import { getStrategy, paramsFor } from './strategies';
import { isWorkingRow, renumber } from './strategies/shared';
import {
  ExerciseState,
  Position,
  ProgramSnapshot,
  ResolvedDay,
  ResolvedExercise,
  ResolvedSet,
  SnapshotExercise,
  SnapshotSet,
  SnapshotWeek,
  StrategyContext,
  WeekLocation,
} from './types';

/**
 * Rows that apply to a week: week-scoped rows win when any exist for that
 * week, otherwise the unscoped rows. Always ordered by setOrder.
 */
export function rowsForWeek(
  sets: SnapshotSet[],
  weekInBlock: number,
): SnapshotSet[] {
  const scoped = sets.filter((set) => set.weekInBlock === weekInBlock);
  const base =
    scoped.length > 0 ? scoped : sets.filter((set) => set.weekInBlock === null);
  return [...base].sort((a, b) => a.setOrder - b.setOrder);
}

export function roundingFor(
  exercise: Pick<SnapshotExercise, 'roundingKg'>,
  state?: Pick<ExerciseState, 'roundingKg'> | null,
): number {
  return state?.roundingKg ?? exercise.roundingKg ?? DEFAULT_ROUNDING_KG;
}

/** Fresh state for a slot that has no row yet (start-empty enrollments). */
export function defaultState(exercise: SnapshotExercise): ExerciseState {
  return {
    progressionKey: exercise.progressionKey,
    exerciseId: exercise.exerciseId,
    workingWeight: null,
    trainingMax: null,
    e1rm: null,
    stageIndex: 0,
    consecutiveFails: 0,
    repsOffset: 0,
    roundingKg: null,
  };
}

/**
 * Deload / step-loading weeks scale the working sets: volume trims sets from
 * the end (never below one), intensity scales loads before rounding, and a
 * deload week never asks for an AMRAP.
 */
export function applyWeekModifiers(
  sets: ResolvedSet[],
  week: SnapshotWeek,
  rounding: number,
): ResolvedSet[] {
  const untouched =
    !week.isDeload &&
    week.volumeMultiplier === 1 &&
    week.intensityMultiplier === 1;
  if (untouched) return sets;

  const warmups = sets.filter((set) => !isWorkingRow(set));
  let working = sets.filter(isWorkingRow);

  if (week.volumeMultiplier !== 1 && working.length > 0) {
    const keep = Math.max(
      1,
      Math.round(working.length * week.volumeMultiplier),
    );
    working = working.slice(0, keep);
  }
  if (week.intensityMultiplier !== 1) {
    working = working.map((set) => ({
      ...set,
      weight:
        set.weight === null
          ? null
          : roundToIncrement(set.weight * week.intensityMultiplier, rounding),
    }));
  }
  if (week.isDeload) {
    working = working.map((set) => ({ ...set, isAmrap: false }));
  }
  return renumber([...warmups, ...working]);
}

export function contextFor(
  location: WeekLocation,
  position: Position,
  rounding: number,
): StrategyContext {
  return {
    position,
    blockIndex: location.blockIndex,
    weekInBlock: location.weekInBlock,
    week: location.week,
    rounding,
  };
}

export function resolveExercise(
  exercise: SnapshotExercise,
  location: WeekLocation,
  position: Position,
  state: ExerciseState,
): ResolvedExercise {
  const params = paramsFor(exercise.strategy, exercise.progression);
  const strategy = getStrategy(params.strategy);
  const rounding = roundingFor(exercise, state);
  const ctx = contextFor(location, position, rounding);
  const resolved = strategy.resolve({
    exercise,
    sets: rowsForWeek(exercise.sets, location.weekInBlock),
    params,
    state,
    ctx,
  });
  return {
    programExerciseId: exercise.id,
    progressionKey: exercise.progressionKey,
    exerciseId: state.exerciseId,
    exercise: exercise.exercise,
    strategy: params.strategy,
    restSeconds: exercise.restSeconds,
    notes: exercise.notes,
    sets: applyWeekModifiers(resolved, location.week, rounding),
  };
}

/**
 * Concrete prescriptions for one program day: every set with its suggested
 * load, reps, RPE and rest, ready to be copied onto a workout.
 */
export function resolveDay(
  snapshot: ProgramSnapshot,
  position: Position,
  statesByKey: ReadonlyMap<string, ExerciseState>,
): ResolvedDay | null {
  const found = findDay(snapshot, position);
  if (!found) return null;
  const { location, day } = found;
  const exercises = [...day.exercises]
    .sort((a, b) => a.exerciseOrder - b.exerciseOrder)
    .map((exercise) =>
      resolveExercise(
        exercise,
        location,
        position,
        statesByKey.get(exercise.progressionKey) ?? defaultState(exercise),
      ),
    );
  return {
    position,
    blockIndex: location.blockIndex,
    weekInBlock: location.weekInBlock,
    dayId: day.id,
    dayName: day.name,
    blockName: location.block.name,
    weekLabel: location.week.label,
    isDeload: location.week.isDeload,
    exercises,
  };
}
