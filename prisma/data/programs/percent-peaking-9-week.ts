import {
  BENCH,
  CHEST_SUPPORTED_ROW,
  DEADLIFT,
  double,
  FACE_PULL,
  LAT_PULLDOWN,
  percentTm,
  range,
  ROW,
  sets,
  slot,
  SQUAT,
  weeklyPercents,
} from './helpers';
import { ProgramSeed, SeedExerciseRef, SeedSet } from './types';

/** Percentages are of the true 1RM; the test week establishes the new max. */
const percent = (exercise: SeedExerciseRef, key: string, rows: SeedSet[], rest = 180) =>
  slot(exercise, key, 'PERCENT_TM', percentTm(0, { tmPercentOf1RM: 100, tmAdvance: 'NONE' }), rows, { rest });

const attempts: SeedSet[] = [
  { reps: 1, percent: 90 },
  { reps: 1, percent: 95 },
  { reps: 1, percent: 100 },
  { reps: 1, percent: 102.5, notes: 'Only if the previous single moved well.' },
];

export const percentPeaking: ProgramSeed = {
  slug: 'percent-peaking-9-week',
  version: 1,
  name: 'Percent-Based Peaking Block',
  description:
    'Nine weeks of high-frequency squat, bench and deadlift work programmed as percentages of your current 1RM: four weeks of volume, three weeks of intensity, a taper week and a test day with singles at 90, 95, 100 and 102.5 %. Enter accurate maxes; the percentages assume them.',
  credit: "Inspired by Boris Sheiko's percentage-based programming",
  goal: 'POWERLIFTING',
  level: 'ELITE',
  scheduleMode: 'SEQUENCE',
  durationMode: 'FIXED',
  daysPerWeek: 4,
  blocks: [
    {
      name: 'Volume',
      focus: 'Many moderate sets',
      weeks: 4,
      days: [
        {
          name: 'Squat + Bench',
          exercises: [
            percent(SQUAT, 'squat', weeklyPercents(5, 5, [70, 72.5, 75, 77.5])),
            percent(BENCH, 'bench', weeklyPercents(6, 4, [72.5, 75, 77.5, 80])),
            slot(LAT_PULLDOWN, 'lat-pulldown', 'DOUBLE', double(2.5), range(4, 8, 12), { rest: 90 }),
          ],
        },
        {
          name: 'Deadlift + Bench',
          exercises: [
            percent(DEADLIFT, 'deadlift', weeklyPercents(4, 4, [72.5, 75, 77.5, 80])),
            percent(BENCH, 'bench', weeklyPercents(4, 5, [65, 67.5, 70, 72.5]), 150),
            slot(ROW, 'row', 'DOUBLE', double(2.5), range(4, 6, 10), { rest: 120 }),
          ],
        },
        {
          name: 'Squat + Bench (heavy)',
          exercises: [
            percent(SQUAT, 'squat', weeklyPercents(4, 4, [75, 77.5, 80, 82.5])),
            percent(BENCH, 'bench', weeklyPercents(5, 3, [77.5, 80, 82.5, 85])),
            slot(CHEST_SUPPORTED_ROW, 'cs-row', 'DOUBLE', double(2.5), range(3, 8, 12), { rest: 90 }),
          ],
        },
        {
          name: 'Deadlift + Squat (light)',
          exercises: [
            percent(DEADLIFT, 'deadlift', weeklyPercents(3, 3, [80, 82.5, 85, 87.5])),
            percent(SQUAT, 'squat', weeklyPercents(3, 5, [65, 67.5, 70, 72.5]), 150),
            slot(FACE_PULL, 'face-pull', 'DOUBLE', double(1), range(3, 12, 20), { rest: 60, roundingKg: 1 }),
          ],
        },
      ],
    },
    {
      name: 'Intensity',
      focus: 'Heavy triples and doubles',
      weeks: 3,
      days: [
        {
          name: 'Squat + Bench',
          exercises: [
            percent(SQUAT, 'squat', weeklyPercents(4, 3, [80, 85, 87.5]), 240),
            percent(BENCH, 'bench', weeklyPercents(5, 3, [82.5, 85, 87.5]), 240),
            slot(LAT_PULLDOWN, 'lat-pulldown', 'DOUBLE', double(2.5), range(3, 8, 12), { rest: 90 }),
          ],
        },
        {
          name: 'Deadlift + Bench (light)',
          exercises: [
            percent(DEADLIFT, 'deadlift', weeklyPercents(3, 3, [82.5, 85, 87.5]), 240),
            percent(BENCH, 'bench', weeklyPercents(3, 4, [70, 72.5, 75]), 150),
            slot(ROW, 'row', 'DOUBLE', double(2.5), range(3, 6, 10), { rest: 120 }),
          ],
        },
        {
          name: 'Squat + Bench (doubles)',
          exercises: [
            percent(SQUAT, 'squat', weeklyPercents(3, 2, [85, 87.5, 90]), 240),
            percent(BENCH, 'bench', weeklyPercents(4, 2, [85, 87.5, 90]), 240),
            slot(CHEST_SUPPORTED_ROW, 'cs-row', 'DOUBLE', double(2.5), range(3, 8, 12), { rest: 90 }),
          ],
        },
        {
          name: 'Deadlift (doubles) + Squat (light)',
          exercises: [
            percent(DEADLIFT, 'deadlift', weeklyPercents(2, 2, [87.5, 90, 92.5]), 240),
            percent(SQUAT, 'squat', weeklyPercents(3, 4, [70, 72.5, 75]), 150),
            slot(FACE_PULL, 'face-pull', 'DOUBLE', double(1), range(3, 12, 20), { rest: 60, roundingKg: 1 }),
          ],
        },
      ],
    },
    {
      name: 'Taper',
      focus: 'Sharpen, recover',
      weeks: [{ label: 'Taper', deload: true }],
      days: [
        {
          name: 'Squat + Bench openers',
          exercises: [
            percent(SQUAT, 'squat', sets(3, { reps: 2, percent: 80 }), 240),
            percent(BENCH, 'bench', sets(3, { reps: 2, percent: 80 }), 240),
          ],
        },
        {
          name: 'Deadlift opener',
          exercises: [
            percent(DEADLIFT, 'deadlift', sets(2, { reps: 2, percent: 80 }), 240),
            percent(BENCH, 'bench', sets(3, { reps: 3, percent: 70 }), 150),
          ],
        },
        {
          name: 'Light technique',
          exercises: [
            percent(SQUAT, 'squat', sets(2, { reps: 2, percent: 75 }), 180),
            percent(BENCH, 'bench', sets(2, { reps: 2, percent: 75 }), 180),
          ],
        },
      ],
    },
    {
      name: 'Test',
      focus: 'New maxes',
      weeks: [{ label: 'Test week' }],
      days: [
        {
          name: 'Test day',
          notes: 'Warm up thoroughly, then work through the singles like a meet.',
          exercises: [
            percent(SQUAT, 'squat', attempts, 300),
            percent(BENCH, 'bench', attempts, 300),
            percent(DEADLIFT, 'deadlift', attempts, 300),
          ],
        },
      ],
    },
  ],
};
