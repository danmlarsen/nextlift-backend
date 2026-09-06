import {
  BENCH,
  BICEPS_CURL,
  CALF_RAISE_MACHINE,
  DEADLIFT,
  double,
  FACE_PULL,
  HAMMER_CURL,
  INCLINE_BENCH_DB,
  LAT_PULLDOWN,
  LATERAL_RAISE,
  LEG_PRESS,
  linear,
  LYING_LEG_CURL,
  OHP,
  range,
  RDL,
  ROW,
  SEATED_ROW,
  sets,
  slot,
  SQUAT,
  TRICEP_OVERHEAD,
  TRICEP_PUSHDOWN,
} from './helpers';
import { ProgramSeed, SeedExercise } from './types';

const main = (increment: number) => linear(increment, { failThreshold: 3, deloadPercent: 10 });
const mainSets = (count: number) => [...sets(count, { reps: 5 }), { reps: 5, amrap: true }];

const pullAccessories: SeedExercise[] = [
  slot(LAT_PULLDOWN, 'lat-pulldown', 'DOUBLE', double(2.5), range(3, 8, 12), { rest: 90 }),
  slot(SEATED_ROW, 'seated-row', 'DOUBLE', double(2.5), range(3, 8, 12), { rest: 90 }),
  slot(FACE_PULL, 'face-pull', 'DOUBLE', double(1), range(5, 15, 20), { rest: 60, roundingKg: 1 }),
  slot(HAMMER_CURL, 'hammer-curl', 'DOUBLE', double(1), range(4, 8, 12), { rest: 60, roundingKg: 1 }),
  slot(BICEPS_CURL, 'biceps-curl', 'DOUBLE', double(1), range(4, 8, 12), { rest: 60, roundingKg: 1 }),
];

const pushAccessories: SeedExercise[] = [
  slot(INCLINE_BENCH_DB, 'incline-db', 'DOUBLE', double(2), range(3, 8, 12), { rest: 90, roundingKg: 2 }),
  slot(TRICEP_PUSHDOWN, 'pushdown', 'DOUBLE', double(1), range(3, 8, 12), { rest: 60, roundingKg: 1 }),
  slot(LATERAL_RAISE, 'lateral-raise', 'DOUBLE', double(1), range(3, 15, 20), { rest: 60, roundingKg: 1 }),
  slot(TRICEP_OVERHEAD, 'tri-overhead', 'DOUBLE', double(1), range(3, 8, 12), { rest: 60, roundingKg: 1 }),
];

const legs = (name: string, weekday: number) => ({
  name,
  weekday,
  exercises: [
    slot(SQUAT, 'squat', 'LINEAR', main(2.5), mainSets(2), { rest: 180 }),
    slot(RDL, 'rdl', 'DOUBLE', double(2.5), range(3, 8, 12), { rest: 120 }),
    slot(LEG_PRESS, 'leg-press', 'DOUBLE', double(5), range(3, 8, 12), { rest: 90, roundingKg: 5 }),
    slot(LYING_LEG_CURL, 'leg-curl', 'DOUBLE', double(2.5), range(3, 8, 12), { rest: 90 }),
    slot(CALF_RAISE_MACHINE, 'calf-raise', 'DOUBLE', double(2.5), range(5, 8, 12), { rest: 60 }),
  ],
});

export const linearPushPullLegs: ProgramSeed = {
  slug: 'linear-push-pull-legs-6-day',
  version: 1,
  name: 'Linear Push / Pull / Legs',
  description:
    'Six days a week on a Monday-to-Saturday schedule. The main lift of each day progresses linearly with a final AMRAP set; accessories use double progression across an 8–12 rep range. Miss the main lift three times and its weight drops 10 %.',
  credit: 'Inspired by the r/Fitness linear progression PPL (Metallicadpa)',
  goal: 'HYPERTROPHY',
  level: 'NOVICE',
  scheduleMode: 'CALENDAR',
  durationMode: 'OPEN_ENDED',
  daysPerWeek: 6,
  blocks: [
    {
      name: 'Week',
      weeks: 1,
      days: [
        {
          name: 'Pull A',
          weekday: 1,
          exercises: [slot(DEADLIFT, 'deadlift', 'LINEAR', main(5), [{ reps: 5, amrap: true }], { rest: 180 }), ...pullAccessories],
        },
        {
          name: 'Push A',
          weekday: 2,
          exercises: [
            slot(BENCH, 'bench', 'LINEAR', main(2.5), mainSets(4), { rest: 180 }),
            slot(OHP, 'ohp-volume', 'DOUBLE', double(2.5), range(3, 8, 12), { rest: 120 }),
            ...pushAccessories,
          ],
        },
        legs('Legs A', 3),
        {
          name: 'Pull B',
          weekday: 4,
          exercises: [slot(ROW, 'row', 'LINEAR', main(2.5), mainSets(4), { rest: 180 }), ...pullAccessories],
        },
        {
          name: 'Push B',
          weekday: 5,
          exercises: [
            slot(OHP, 'ohp', 'LINEAR', main(2.5), mainSets(4), { rest: 180 }),
            slot(BENCH, 'bench-volume', 'DOUBLE', double(2.5), range(3, 8, 12), { rest: 120 }),
            ...pushAccessories,
          ],
        },
        legs('Legs B', 6),
      ],
    },
  ],
};
