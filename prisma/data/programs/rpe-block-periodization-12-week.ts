import {
  BENCH,
  CHEST_SUPPORTED_ROW,
  CLOSE_GRIP_BENCH,
  DEADLIFT,
  double,
  FACE_PULL,
  FRONT_SQUAT,
  INCLINE_BENCH_BB,
  LAT_PULLDOWN,
  OHP,
  range,
  RDL,
  ROW,
  slot,
  SQUAT,
  topSetBackoff,
  weeklyTopSets,
} from './helpers';
import { ProgramSeed, SeedBlock, SeedDay, SeedExerciseRef, SeedWeek } from './types';

type BlockSpec = {
  name: string;
  focus: string;
  reps: number;
  rpes: number[];
  backoffPercent: number;
  backoffSets: number;
  weeks: SeedWeek[];
};

const main = (exercise: SeedExerciseRef, key: string, spec: BlockSpec) =>
  slot(
    exercise,
    key,
    'RPE',
    topSetBackoff(spec.backoffPercent, spec.backoffSets),
    weeklyTopSets(spec.reps, spec.rpes),
    { rest: 240 },
  );

const days = (spec: BlockSpec): SeedDay[] => [
  {
    name: 'Squat + Bench',
    exercises: [
      main(SQUAT, 'squat', spec),
      main(BENCH, 'bench', spec),
      slot(ROW, 'row', 'DOUBLE', double(2.5), range(3, 6, 10), { rest: 120 }),
    ],
  },
  {
    name: 'Deadlift + Press',
    exercises: [
      main(DEADLIFT, 'deadlift', spec),
      main(OHP, 'ohp', spec),
      slot(LAT_PULLDOWN, 'lat-pulldown', 'DOUBLE', double(2.5), range(3, 8, 12), { rest: 90 }),
    ],
  },
  {
    name: 'Front squat + Close grip',
    exercises: [
      main(FRONT_SQUAT, 'front-squat', spec),
      main(CLOSE_GRIP_BENCH, 'cg-bench', spec),
      slot(CHEST_SUPPORTED_ROW, 'cs-row', 'DOUBLE', double(2.5), range(3, 8, 12), { rest: 90 }),
    ],
  },
  {
    name: 'RDL + Incline',
    exercises: [
      main(RDL, 'rdl', spec),
      main(INCLINE_BENCH_BB, 'incline-bb', spec),
      slot(FACE_PULL, 'face-pull', 'DOUBLE', double(1), range(3, 12, 20), { rest: 60, roundingKg: 1 }),
    ],
  },
];

const block = (spec: BlockSpec): SeedBlock => ({
  name: spec.name,
  focus: spec.focus,
  weeks: spec.weeks,
  days: days(spec),
});

export const rpeBlockPeriodization: ProgramSeed = {
  slug: 'rpe-block-periodization-12-week',
  version: 1,
  name: 'RPE Block Periodization',
  description:
    'Twelve weeks in three blocks: accumulation (fives), intensification (triples) and peaking (doubles and singles), each ending in a lighter week. Every main lift is a top set at a target RPE with back-off sets; the load is suggested from your estimated 1RM and re-estimated from the RPE you log.',
  credit: 'Inspired by Reactive Training Systems (Mike Tuchscherer)',
  goal: 'POWERLIFTING',
  level: 'ADVANCED',
  scheduleMode: 'SEQUENCE',
  durationMode: 'FIXED',
  daysPerWeek: 4,
  blocks: [
    block({
      name: 'Accumulation',
      focus: 'Volume with fives',
      reps: 5,
      rpes: [7, 8, 9, 7],
      backoffPercent: 90,
      backoffSets: 3,
      weeks: [{ label: 'RPE 7' }, { label: 'RPE 8' }, { label: 'RPE 9' }, { label: 'Deload', deload: true, volume: 0.6, intensity: 0.9 }],
    }),
    block({
      name: 'Intensification',
      focus: 'Heavier triples',
      reps: 3,
      rpes: [7, 8, 9, 7],
      backoffPercent: 92,
      backoffSets: 3,
      weeks: [{ label: 'RPE 7' }, { label: 'RPE 8' }, { label: 'RPE 9' }, { label: 'Deload', deload: true, volume: 0.6, intensity: 0.9 }],
    }),
    block({
      name: 'Peaking',
      focus: 'Singles and a test',
      reps: 1,
      rpes: [7, 8, 9, 10],
      backoffPercent: 95,
      backoffSets: 2,
      weeks: [{ label: 'RPE 7' }, { label: 'RPE 8' }, { label: 'RPE 9' }, { label: 'Test week', volume: 0.34 }],
    }),
  ],
};
