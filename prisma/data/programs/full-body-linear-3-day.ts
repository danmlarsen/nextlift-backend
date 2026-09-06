import { BENCH, DEADLIFT, linear, OHP, ROW, sets, slot, SQUAT } from './helpers';
import { ProgramSeed } from './types';

const main = (increment: number) =>
  linear(increment, { failThreshold: 3, deloadPercent: 10 });

const warmups = [
  { type: 'warmup' as const, reps: 5, percent: 50 },
  { type: 'warmup' as const, reps: 3, percent: 75 },
];

export const fullBodyLinear: ProgramSeed = {
  slug: 'full-body-linear-3-day',
  version: 1,
  name: 'Full-Body Linear Progression',
  description:
    'Two alternating full-body workouts, three days a week. Add weight every session you complete all sets; three misses in a row take 10 % off so you can build back up. The fastest way for a beginner to get strong on the basic barbell lifts.',
  credit: 'Inspired by Starting Strength (Mark Rippetoe) and StrongLifts 5×5 (Mehdi Hadim)',
  goal: 'STRENGTH',
  level: 'BEGINNER',
  scheduleMode: 'SEQUENCE',
  durationMode: 'OPEN_ENDED',
  daysPerWeek: 3,
  blocks: [
    {
      name: 'A / B rotation',
      weeks: 1,
      days: [
        {
          name: 'Workout A',
          exercises: [
            slot(SQUAT, 'squat', 'LINEAR', main(2.5), [...warmups, ...sets(3, { reps: 5 })], { rest: 180 }),
            slot(BENCH, 'bench', 'LINEAR', main(2.5), [...warmups, ...sets(3, { reps: 5 })], { rest: 180 }),
            slot(ROW, 'row', 'LINEAR', main(2.5), sets(3, { reps: 5 }), { rest: 120 }),
          ],
        },
        {
          name: 'Workout B',
          exercises: [
            slot(SQUAT, 'squat', 'LINEAR', main(2.5), [...warmups, ...sets(3, { reps: 5 })], { rest: 180 }),
            slot(OHP, 'ohp', 'LINEAR', main(2.5), [...warmups, ...sets(3, { reps: 5 })], { rest: 180 }),
            slot(DEADLIFT, 'deadlift', 'LINEAR', main(5), [{ type: 'warmup', reps: 5, percent: 60 }, ...sets(1, { reps: 5 })], { rest: 180 }),
          ],
        },
      ],
    },
  ],
};
