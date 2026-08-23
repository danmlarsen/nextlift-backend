import { RecordType } from '@prisma/client';

export type EligibleSetInput = {
  id: number;
  completed: boolean;
  type: string;
  weight: number | null;
  reps: number | null;
  duration: number | null;
};

export type NewRecord = {
  recordType: RecordType;
  exerciseId: number;
  exerciseName: string;
  value: number;
  previousValue: number | null;
  workoutSetId: number;
  achievedAt: Date;
};

export type PersonalRecordItem = {
  recordType: RecordType;
  value: number;
  achievedAt: Date;
  workoutSetId: number;
  set: {
    weight: number | null;
    reps: number | null;
    duration: number | null;
    setNumber: number;
  };
};

export type ExerciseRecords = {
  exerciseId: number;
  exerciseName: string;
  exerciseCategory: string;
  records: PersonalRecordItem[];
};
