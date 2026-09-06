import {
  BENCH,
  CHIN_UP,
  DB_ROW,
  DEADLIFT,
  DIP,
  double,
  fsl531,
  HANGING_LEG_RAISE,
  LYING_LEG_CURL,
  OHP,
  percentTm,
  PUSH_UP,
  range,
  ROW,
  slot,
  SQUAT,
  supplementalFromTm,
  wave531,
} from './helpers';
import { ProgramSeed, SeedExercise, SeedExerciseRef } from './types';

const mainLift = (exercise: SeedExerciseRef, key: string, tmIncrementKg: number): SeedExercise[] => [
  slot(exercise, key, 'PERCENT_TM', percentTm(tmIncrementKg, { tmPercentOf1RM: 90, tmAdvance: 'CYCLE_END' }), wave531(), {
    rest: 180,
    notes: 'Last set of weeks 1–3 is an AMRAP: leave one rep in the tank.',
  }),
  slot(exercise, key, 'NONE', supplementalFromTm(), fsl531(), { rest: 120, notes: 'First-set-last: 5×5 at the opening percentage.' }),
];

export const percentWave: ProgramSeed = {
  slug: 'percent-wave-4-day',
  version: 1,
  name: '5/3/1-Style Percent Wave',
  description:
    'One main lift per day programmed off a training max (90 % of your 1RM): 5s week, 3s week, 5/3/1 week, then a deload. First-set-last 5×5 adds volume; assistance is done with double progression. Every cycle the training max goes up 2.5 kg for presses and 5 kg for squat and deadlift.',
  credit: "Inspired by Jim Wendler's 5/3/1",
  goal: 'STRENGTH',
  level: 'INTERMEDIATE',
  scheduleMode: 'SEQUENCE',
  durationMode: 'OPEN_ENDED',
  daysPerWeek: 4,
  blocks: [
    {
      name: 'Wave',
      weeks: [{ label: '5s week' }, { label: '3s week' }, { label: '5/3/1 week' }, { label: 'Deload', deload: true }],
      days: [
        {
          name: 'Press day',
          exercises: [
            ...mainLift(OHP, 'ohp', 2.5),
            slot(DIP, 'dip', 'DOUBLE', double(0, 'REPS'), range(5, 8, 12), { rest: 90 }),
            slot(CHIN_UP, 'chin-up', 'DOUBLE', double(0, 'REPS'), range(5, 6, 10), { rest: 90 }),
            slot(HANGING_LEG_RAISE, 'hlr', 'DOUBLE', double(0, 'REPS'), range(3, 10, 15), { rest: 60 }),
          ],
        },
        {
          name: 'Deadlift day',
          exercises: [
            ...mainLift(DEADLIFT, 'deadlift', 5),
            slot(ROW, 'row', 'DOUBLE', double(2.5), range(5, 8, 12), { rest: 90 }),
            slot(HANGING_LEG_RAISE, 'hlr', 'DOUBLE', double(0, 'REPS'), range(3, 10, 15), { rest: 60 }),
          ],
        },
        {
          name: 'Bench day',
          exercises: [
            ...mainLift(BENCH, 'bench', 2.5),
            slot(DB_ROW, 'db-row', 'DOUBLE', double(2), range(5, 8, 12), { rest: 90, roundingKg: 2 }),
            slot(PUSH_UP, 'push-up', 'DOUBLE', double(0, 'REPS'), range(5, 10, 20), { rest: 60 }),
          ],
        },
        {
          name: 'Squat day',
          exercises: [
            ...mainLift(SQUAT, 'squat', 5),
            slot(LYING_LEG_CURL, 'leg-curl', 'DOUBLE', double(2.5), range(5, 8, 12), { rest: 90 }),
            slot(HANGING_LEG_RAISE, 'hlr', 'DOUBLE', double(0, 'REPS'), range(3, 10, 15), { rest: 60 }),
          ],
        },
      ],
    },
  ],
};
