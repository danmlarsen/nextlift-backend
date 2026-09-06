import {
  BENCH,
  CHIN_UP,
  DEADLIFT,
  double,
  followWorkingWeight,
  HANGING_LEG_RAISE,
  linear,
  OHP,
  range,
  sets,
  slot,
  SQUAT,
} from './helpers';
import { ProgramSeed } from './types';

const intensity = (increment: number) => linear(increment, { failThreshold: 3, deloadPercent: 10 });
const rampUp = [
  { type: 'warmup' as const, reps: 5, percent: 50 },
  { type: 'warmup' as const, reps: 3, percent: 70 },
  { type: 'warmup' as const, reps: 2, percent: 85 },
];

export const volumeRecoveryIntensity: ProgramSeed = {
  slug: 'volume-recovery-intensity-3-day',
  version: 1,
  name: 'Volume / Recovery / Intensity',
  description:
    'A weekly undulation for lifters who have outgrown session-to-session progression. Monday is volume (5×5 at 90 % of Friday’s weight), Wednesday is light recovery work, and Friday is a new five-rep best on squat, bench and deadlift. Friday’s weight drives the whole week.',
  credit: 'Inspired by the Texas Method (Glenn Pendlay, Mark Rippetoe)',
  goal: 'STRENGTH',
  level: 'INTERMEDIATE',
  scheduleMode: 'CALENDAR',
  durationMode: 'OPEN_ENDED',
  daysPerWeek: 3,
  blocks: [
    {
      name: 'Week',
      weeks: 1,
      days: [
        {
          name: 'Volume day',
          weekday: 1,
          exercises: [
            slot(SQUAT, 'squat', 'NONE', followWorkingWeight(), sets(5, { reps: 5, percent: 90 }), { rest: 180 }),
            slot(BENCH, 'bench', 'NONE', followWorkingWeight(), sets(5, { reps: 5, percent: 90 }), { rest: 180 }),
            slot(DEADLIFT, 'deadlift', 'NONE', followWorkingWeight(), sets(1, { reps: 5, percent: 90 }), { rest: 180 }),
          ],
        },
        {
          name: 'Recovery day',
          weekday: 3,
          exercises: [
            slot(SQUAT, 'squat', 'NONE', followWorkingWeight(), sets(2, { reps: 5, percent: 80 }), { rest: 150 }),
            slot(OHP, 'ohp', 'LINEAR', intensity(2.5), sets(3, { reps: 5 }), { rest: 150 }),
            slot(CHIN_UP, 'chin-up', 'DOUBLE', double(0, 'REPS'), range(3, 6, 10), { rest: 90 }),
            slot(HANGING_LEG_RAISE, 'hlr', 'DOUBLE', double(0, 'REPS'), range(3, 10, 15), { rest: 60 }),
          ],
        },
        {
          name: 'Intensity day',
          weekday: 5,
          exercises: [
            slot(SQUAT, 'squat', 'LINEAR', intensity(2.5), [...rampUp, ...sets(1, { reps: 5 })], { rest: 240 }),
            slot(BENCH, 'bench', 'LINEAR', intensity(2.5), [...rampUp, ...sets(1, { reps: 5 })], { rest: 240 }),
            slot(DEADLIFT, 'deadlift', 'LINEAR', intensity(5), [{ type: 'warmup', reps: 3, percent: 70 }, ...sets(1, { reps: 5 })], { rest: 240 }),
          ],
        },
      ],
    },
  ],
};
