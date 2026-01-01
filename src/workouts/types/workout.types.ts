export enum WorkoutSetType {
  NORMAL = 'normal',
  WARMUP = 'warmup',
  DROPSET = 'dropset',
  FAILURE = 'failure',
}

export type WorkoutSetData = {
  completed: boolean;
  weight: number | null;
  reps: number | null;
  duration: number | null;
  type: string;
};

export type WorkoutExerciseData = {
  workoutSets: WorkoutSetData[];
};
