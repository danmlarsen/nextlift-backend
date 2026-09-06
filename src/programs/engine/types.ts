/**
 * Pure types for the program engine. Nothing in this folder imports Nest or
 * Prisma: the engine works on the enrollment snapshot (a serialized program
 * tree) plus per-slot state rows, and returns plain data.
 */

export type ProgressionStrategyName =
  'NONE' | 'LINEAR' | 'DOUBLE' | 'PERCENT_TM' | 'RPE';

export type LoadBasis = 'FIXED' | 'WORKING_WEIGHT' | 'TRAINING_MAX' | 'E1RM';

export type LinearStage = {
  sets: number;
  reps: number;
  amrapLast?: boolean;
};

export type LinearParams = {
  strategy: 'LINEAR';
  incrementKg: number;
  /** Consecutive failed sessions before a stage change or reset. Default 3. */
  failThreshold?: number;
  /** Back-off applied when there are no (more) stages. Default 10 (%). */
  deloadPercent?: number;
  /** Set x rep schemes to fall back through at the same load (GZCLP T1/T2). */
  stages?: LinearStage[];
  /** Load kept after failing the last stage. Default 85 (%). */
  stageResetPercent?: number;
  /** When set, progress only when the AMRAP set reaches this many reps. */
  amrapRepsThreshold?: number;
};

export type DoubleParams = {
  strategy: 'DOUBLE';
  incrementKg: number;
  /** LOAD adds weight at the top of the range; REPS widens the range instead. */
  mode?: 'LOAD' | 'REPS';
  repsStep?: number;
};

export type AmrapTmRule = {
  minReps: number;
  maxReps: number | null;
  incrementKg: number;
};

export type PercentTmParams = {
  strategy: 'PERCENT_TM';
  /** Training max as a percentage of the estimated 1RM. Default 90. */
  tmPercentOf1RM?: number;
  tmIncrementKg: number;
  /** When the training max moves. Default CYCLE_END. */
  tmAdvance?: 'CYCLE_END' | 'AMRAP' | 'NONE';
  amrapTmRule?: AmrapTmRule[];
};

export type RpeTopSetParams = {
  strategy: 'RPE';
  mode: 'TOP_SET_BACKOFF';
  /** Back-off load as a percentage of the resolved top set. */
  backoffPercent: number;
  /** Back-off sets synthesized when the rows only describe the top set. */
  backoffSets: number;
};

export type RpeMesocycleParams = {
  strategy: 'RPE';
  mode: 'RIR_MESOCYCLE';
  startRir: number;
  endRir: number;
  addSetsPerWeek: number;
  maxSets: number;
  incrementKg: number;
};

export type RpeParams = RpeTopSetParams | RpeMesocycleParams;

export type NoneParams = {
  strategy: 'NONE';
  basis?: Exclude<LoadBasis, 'E1RM'>;
};

export type ProgressionParams =
  LinearParams | DoubleParams | PercentTmParams | RpeParams | NoneParams;

export type SnapshotSet = {
  id: number;
  weekInBlock: number | null;
  setOrder: number;
  type: string;
  repsMin: number | null;
  repsMax: number | null;
  isAmrap: boolean;
  percent: number | null;
  weight: number | null;
  targetRpe: number | null;
  restSeconds: number | null;
  duration: number | null;
  notes: string | null;
};

export type SnapshotExerciseInfo = {
  id: number;
  name: string;
  equipment: string;
  category: string;
};

export type SnapshotExercise = {
  id: number;
  exerciseId: number;
  exerciseOrder: number;
  progressionKey: string;
  strategy: ProgressionStrategyName;
  progression: ProgressionParams | null;
  roundingKg: number | null;
  restSeconds: number | null;
  notes: string | null;
  exercise: SnapshotExerciseInfo;
  sets: SnapshotSet[];
};

export type SnapshotDay = {
  id: number;
  dayOrder: number;
  name: string;
  weekday: number | null;
  notes: string | null;
  exercises: SnapshotExercise[];
};

export type SnapshotWeek = {
  id: number;
  weekInBlock: number;
  label: string | null;
  isDeload: boolean;
  volumeMultiplier: number;
  intensityMultiplier: number;
};

export type SnapshotBlock = {
  id: number;
  blockOrder: number;
  name: string;
  focus: string | null;
  weeks: SnapshotWeek[];
  days: SnapshotDay[];
};

export type ProgramSnapshot = {
  id: number;
  version: number;
  name: string;
  description: string | null;
  credit: string | null;
  goal: string;
  level: string;
  scheduleMode: 'SEQUENCE' | 'CALENDAR';
  durationMode: 'FIXED' | 'OPEN_ENDED';
  daysPerWeek: number;
  effortScale: 'RPE' | 'RIR';
  blocks: SnapshotBlock[];
};

export type ExerciseState = {
  progressionKey: string;
  exerciseId: number;
  workingWeight: number | null;
  trainingMax: number | null;
  e1rm: number | null;
  stageIndex: number;
  consecutiveFails: number;
  repsOffset: number;
  roundingKg: number | null;
};

export type Position = {
  cycle: number;
  /** 1-based week number counted across all blocks of the cycle. */
  weekIndex: number;
  /** 1-based day number inside the block that owns the week. */
  dayIndex: number;
};

export type WeekLocation = {
  blockIndex: number;
  weekInBlock: number;
  block: SnapshotBlock;
  week: SnapshotWeek;
};

export type StrategyContext = {
  position: Position;
  blockIndex: number;
  weekInBlock: number;
  week: SnapshotWeek;
  /** Load rounding increment in kg for this slot. */
  rounding: number;
};

export type ResolvedSet = {
  /** Snapshot set id; synthesized sets reuse the id of the row they copy. */
  programSetId: number;
  setOrder: number;
  type: string;
  repsMin: number | null;
  repsMax: number | null;
  isAmrap: boolean;
  targetRpe: number | null;
  restSeconds: number | null;
  duration: number | null;
  weight: number | null;
  percent: number | null;
  basis: LoadBasis | null;
  notes: string | null;
};

export type ResolvedExercise = {
  programExerciseId: number;
  progressionKey: string;
  exerciseId: number;
  exercise: SnapshotExerciseInfo;
  strategy: ProgressionStrategyName;
  restSeconds: number | null;
  notes: string | null;
  sets: ResolvedSet[];
};

export type ResolvedDay = {
  position: Position;
  blockIndex: number;
  weekInBlock: number;
  dayId: number;
  dayName: string;
  blockName: string;
  weekLabel: string | null;
  isDeload: boolean;
  exercises: ResolvedExercise[];
};

export type SetResult = {
  programSetId: number;
  type: string;
  completed: boolean;
  reps: number | null;
  weight: number | null;
  rpe: number | null;
  prescribed: {
    repsMin: number | null;
    repsMax: number | null;
    isAmrap: boolean;
    weight: number | null;
    targetRpe: number | null;
  };
};

export type ProgressionEventKind =
  | 'SEED'
  | 'INCREMENT'
  | 'DECREMENT'
  | 'HOLD'
  | 'FAIL'
  | 'STAGE_ADVANCE'
  | 'RESET'
  | 'TM_INCREMENT'
  | 'REPS_INCREMENT'
  | 'E1RM_UPDATE';

export type ProgressionEvent = {
  progressionKey: string;
  exerciseId: number;
  exerciseName: string;
  kind: ProgressionEventKind;
  from: number | null;
  to: number | null;
  message: string;
};

export type StrategyResolveInput<P> = {
  exercise: SnapshotExercise;
  /** Rows already narrowed to the current week. */
  sets: SnapshotSet[];
  params: P;
  state: ExerciseState;
  ctx: StrategyContext;
};

export type StrategyApplyInput<P> = {
  exercise: SnapshotExercise;
  params: P;
  state: ExerciseState;
  /** Program-generated, non-warm-up sets of this slot. */
  results: SetResult[];
  ctx: StrategyContext;
};

export type StrategyApplyOutput = {
  state: ExerciseState;
  event?: ProgressionEvent;
};

export type StrategyCycleEndInput<P> = {
  exercise: SnapshotExercise;
  params: P;
  state: ExerciseState;
  rounding: number;
};

export interface Strategy<P extends ProgressionParams> {
  resolve(input: StrategyResolveInput<P>): ResolvedSet[];
  apply(input: StrategyApplyInput<P>): StrategyApplyOutput;
  onCycleEnd?(input: StrategyCycleEndInput<P>): StrategyApplyOutput;
}
