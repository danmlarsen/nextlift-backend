import {
  CABLE_CRUNCH,
  CABLE_ROW,
  CHEST_PRESS,
  DB_LUNGE,
  DB_OHP,
  DEAD_BUG,
  double,
  GLUTE_BRIDGE,
  GOBLET_SQUAT,
  INCLINE_BENCH_DB,
  LAT_PULLDOWN,
  LATERAL_RAISE,
  LEG_PRESS,
  PUSH_UP,
  range,
  RDL,
  SEATED_ROW,
  slot,
} from './helpers';
import { ProgramSeed, SeedWeek } from './types';

const weeks: SeedWeek[] = [
  { label: 'Week 1' },
  { label: 'Week 2' },
  { label: 'Week 3' },
  { label: 'Week 4' },
  { label: 'Week 5' },
  { label: 'Week 6' },
  { label: 'Week 7' },
  { label: 'Easy week', deload: true, volume: 0.7, intensity: 0.85 },
];

export const fullBodyFitness: ProgramSeed = {
  slug: 'full-body-fitness-3-day',
  version: 1,
  name: 'Full-Body Fitness Foundations',
  description:
    'Eight weeks of three full-body sessions a week built on the guidelines for new lifters: two to three sets of 8–12 reps per exercise, adding a little weight whenever you reach 12 reps on every set. Machines and dumbbells keep it simple; the last week is easier.',
  credit: 'Following ACSM guidance on progression for novice resistance training',
  goal: 'GENERAL_FITNESS',
  level: 'BEGINNER',
  scheduleMode: 'CALENDAR',
  durationMode: 'FIXED',
  daysPerWeek: 3,
  blocks: [
    {
      name: 'Foundation',
      weeks,
      days: [
        {
          name: 'Day A',
          weekday: 1,
          exercises: [
            slot(GOBLET_SQUAT, 'goblet-squat', 'DOUBLE', double(2), range(3, 8, 12), { rest: 90, roundingKg: 2 }),
            slot(PUSH_UP, 'push-up', 'DOUBLE', double(0, 'REPS'), range(3, 8, 12), { rest: 90 }),
            slot(SEATED_ROW, 'seated-row', 'DOUBLE', double(2.5), range(3, 8, 12), { rest: 90 }),
            slot(DB_OHP, 'db-ohp', 'DOUBLE', double(2), range(2, 8, 12), { rest: 90, roundingKg: 2 }),
            slot(DEAD_BUG, 'dead-bug', 'DOUBLE', double(0, 'REPS'), range(2, 8, 12), { rest: 60 }),
          ],
        },
        {
          name: 'Day B',
          weekday: 3,
          exercises: [
            slot(LEG_PRESS, 'leg-press', 'DOUBLE', double(5), range(3, 8, 12), { rest: 90, roundingKg: 5 }),
            slot(CHEST_PRESS, 'chest-press', 'DOUBLE', double(2.5), range(3, 8, 12), { rest: 90 }),
            slot(LAT_PULLDOWN, 'lat-pulldown', 'DOUBLE', double(2.5), range(3, 8, 12), { rest: 90 }),
            slot(DB_LUNGE, 'db-lunge', 'DOUBLE', double(2), range(2, 8, 12), { rest: 90, roundingKg: 2 }),
            slot(GLUTE_BRIDGE, 'glute-bridge', 'DOUBLE', double(0, 'REPS'), range(2, 10, 15), { rest: 60 }),
          ],
        },
        {
          name: 'Day C',
          weekday: 5,
          exercises: [
            slot(RDL, 'rdl', 'DOUBLE', double(2.5), range(3, 8, 12), { rest: 120 }),
            slot(INCLINE_BENCH_DB, 'incline-db', 'DOUBLE', double(2), range(3, 8, 12), { rest: 90, roundingKg: 2 }),
            slot(CABLE_ROW, 'cable-row', 'DOUBLE', double(2.5), range(3, 8, 12), { rest: 90 }),
            slot(LATERAL_RAISE, 'lateral-raise', 'DOUBLE', double(1), range(2, 10, 15), { rest: 60, roundingKg: 1 }),
            slot(CABLE_CRUNCH, 'cable-crunch', 'DOUBLE', double(2.5), range(2, 10, 15), { rest: 60 }),
          ],
        },
      ],
    },
  ],
};
