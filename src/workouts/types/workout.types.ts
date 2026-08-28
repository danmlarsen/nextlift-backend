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

export type WeeklyReportMuscle = {
  muscleGroup: string;
  score: number;
  sets: number;
};

export type WeeklyReportResult = {
  totalWorkouts: number;
  totalMinutes: number;
  totalWeightLifted: number;
  weekStreak: number;
  muscles: WeeklyReportMuscle[];
};
