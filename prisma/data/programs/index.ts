import { fullBodyFitness } from './full-body-fitness-3-day';
import { fullBodyLinear } from './full-body-linear-3-day';
import { homeDumbbellBodyweight } from './home-dumbbell-bodyweight-3-day';
import { linearPushPullLegs } from './linear-push-pull-legs-6-day';
import { percentPeaking } from './percent-peaking-9-week';
import { percentWave } from './percent-wave-4-day';
import { rpeBlockPeriodization } from './rpe-block-periodization-12-week';
import { tieredLinear } from './tiered-linear-3-day';
import { ProgramSeed } from './types';
import { upperLowerHypertrophy } from './upper-lower-hypertrophy-4-day';
import { volumeRecoveryIntensity } from './volume-recovery-intensity-3-day';

/** Curated programs seeded for the system user, ordered beginner → elite. */
export const programSeeds: ProgramSeed[] = [
  fullBodyLinear,
  tieredLinear,
  fullBodyFitness,
  homeDumbbellBodyweight,
  linearPushPullLegs,
  percentWave,
  upperLowerHypertrophy,
  volumeRecoveryIntensity,
  rpeBlockPeriodization,
  percentPeaking,
];

/** Slug of the program demo accounts are enrolled in. */
export const DEMO_PROGRAM_SLUG = fullBodyLinear.slug;

export * from './types';
