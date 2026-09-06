/**
 * Declarative format for curated programs. Kept free of `src/` imports so
 * `prisma/seed.ts` can run it with plain ts-node / node; a spec under
 * src/programs/seeds validates every definition against the real DTOs.
 */
export type SeedExerciseRef = { name: string; equipment: string };

export type SeedSet = {
  /** Scope the row to one week of the block (1-based); omit for every week. */
  week?: number;
  type?: 'normal' | 'warmup' | 'dropset' | 'failure';
  reps?: number;
  repsMin?: number;
  repsMax?: number;
  amrap?: boolean;
  /** Percent of the strategy's load basis (training max / working weight). */
  percent?: number;
  weight?: number;
  rpe?: number;
  rest?: number;
  duration?: number;
  notes?: string;
};

export type SeedStrategy = 'NONE' | 'LINEAR' | 'DOUBLE' | 'PERCENT_TM' | 'RPE';

export type SeedExercise = {
  exercise: SeedExerciseRef;
  key: string;
  strategy: SeedStrategy;
  progression?: Record<string, unknown> | null;
  roundingKg?: number;
  rest?: number;
  notes?: string;
  sets: SeedSet[];
};

export type SeedDay = {
  name: string;
  /** 1 = Monday ... 7 = Sunday (calendar programs). */
  weekday?: number;
  notes?: string;
  exercises: SeedExercise[];
};

export type SeedWeek = {
  label?: string;
  deload?: boolean;
  volume?: number;
  intensity?: number;
};

export type SeedBlock = {
  name: string;
  focus?: string;
  weeks: number | SeedWeek[];
  days: SeedDay[];
};

export type ProgramSeed = {
  slug: string;
  version: number;
  name: string;
  description: string;
  credit?: string;
  goal:
    | 'STRENGTH'
    | 'HYPERTROPHY'
    | 'GENERAL_FITNESS'
    | 'POWERLIFTING'
    | 'ENDURANCE'
    | 'ATHLETIC';
  level: 'BEGINNER' | 'NOVICE' | 'INTERMEDIATE' | 'ADVANCED' | 'ELITE';
  scheduleMode?: 'SEQUENCE' | 'CALENDAR';
  durationMode?: 'FIXED' | 'OPEN_ENDED';
  daysPerWeek: number;
  effortScale?: 'RPE' | 'RIR';
  blocks: SeedBlock[];
};
