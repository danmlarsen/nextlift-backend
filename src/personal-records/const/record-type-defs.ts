import { RecordType } from '@prisma/client';
import { calculateOneRepMax } from 'src/common/utils';
import { WorkoutSetType } from 'src/workouts/types/workout.types';
import { EligibleSetInput } from '../types/personal-record.types';

// Eligibility must stay in sync with the backfill SQL in the
// personal_records migration and any future recompute migrations.
const isEligibleBase = (set: EligibleSetInput): boolean =>
  set.completed &&
  set.type !== (WorkoutSetType.WARMUP as string) &&
  set.weight !== null &&
  set.weight > 0;

const hasReps = (set: EligibleSetInput): boolean =>
  set.reps !== null && set.reps > 0;

export const RECORD_TYPE_DEFS: Record<
  RecordType,
  {
    isEligible: (set: EligibleSetInput) => boolean;
    getValue: (set: EligibleSetInput) => number;
  }
> = {
  [RecordType.MAX_WEIGHT]: {
    isEligible: isEligibleBase,
    getValue: (set) => set.weight!,
  },
  [RecordType.ONE_REP_MAX]: {
    isEligible: (set) => isEligibleBase(set) && hasReps(set),
    getValue: (set) => calculateOneRepMax(set.weight!, set.reps!),
  },
  [RecordType.MAX_SET_VOLUME]: {
    isEligible: (set) => isEligibleBase(set) && hasReps(set),
    getValue: (set) => set.weight! * set.reps!,
  },
};

export const RECORD_TYPES: RecordType[] = [
  RecordType.MAX_WEIGHT,
  RecordType.ONE_REP_MAX,
  RecordType.MAX_SET_VOLUME,
];

// Stored values lose their last significant digit on the Prisma wire (doubles
// are rounded to ~16 digits), so exact equality misreads a re-saved tie as a
// new record. Genuine improvements are at least 0.01 kg, far above this band.
export const VALUE_EPSILON = 1e-6;
