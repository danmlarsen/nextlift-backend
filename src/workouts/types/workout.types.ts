export enum WorkoutSetType {
  NORMAL = 'normal',
  WARMUP = 'warmup',
  DROPSET = 'dropset',
  FAILURE = 'failure',
}

export type ExerciseData = {
  name: string;
  category: string;
};

export type WorkoutSetData = {
  completed: boolean;
  weight: number | null;
  reps: number | null;
  duration: number | null;
  type: string;
};

export type WorkoutExerciseData = {
  exercise: ExerciseData;
  workoutSets: WorkoutSetData[];
};
