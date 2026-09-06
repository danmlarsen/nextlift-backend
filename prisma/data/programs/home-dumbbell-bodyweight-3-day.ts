import {
  ARNOLD_PRESS,
  BICEPS_CURL,
  BURPEE,
  DB_LUNGE,
  DB_OHP,
  DB_ROW,
  DB_STIFF_LEG_DL,
  DEAD_BUG,
  double,
  GLUTE_BRIDGE,
  GOBLET_SQUAT,
  HAMMER_CURL,
  PUSH_UP,
  range,
  RENEGADE_ROW,
  RUSSIAN_TWIST,
  slot,
  STEP_UP,
} from './helpers';
import { ProgramSeed } from './types';

export const homeDumbbellBodyweight: ProgramSeed = {
  slug: 'home-dumbbell-bodyweight-3-day',
  version: 1,
  name: 'Home Dumbbell & Bodyweight',
  description:
    'Three rotating full-body workouts you can do at home with a pair of dumbbells. Dumbbell moves add weight when you reach the top of the rep range; bodyweight moves add reps instead. Rest about a minute between sets.',
  goal: 'GENERAL_FITNESS',
  level: 'BEGINNER',
  scheduleMode: 'SEQUENCE',
  durationMode: 'OPEN_ENDED',
  daysPerWeek: 3,
  blocks: [
    {
      name: 'Rotation',
      weeks: 1,
      days: [
        {
          name: 'Workout A',
          exercises: [
            slot(GOBLET_SQUAT, 'goblet-squat', 'DOUBLE', double(2), range(3, 10, 15), { rest: 75, roundingKg: 2 }),
            slot(PUSH_UP, 'push-up', 'DOUBLE', double(0, 'REPS'), range(3, 8, 15), { rest: 75 }),
            slot(DB_ROW, 'db-row', 'DOUBLE', double(2), range(3, 10, 15), { rest: 75, roundingKg: 2 }),
            slot(GLUTE_BRIDGE, 'glute-bridge', 'DOUBLE', double(0, 'REPS'), range(3, 12, 20), { rest: 60 }),
            slot(DEAD_BUG, 'dead-bug', 'DOUBLE', double(0, 'REPS'), range(2, 8, 12), { rest: 60 }),
          ],
        },
        {
          name: 'Workout B',
          exercises: [
            slot(DB_LUNGE, 'db-lunge', 'DOUBLE', double(2), range(3, 8, 12), { rest: 75, roundingKg: 2 }),
            slot(DB_OHP, 'db-ohp', 'DOUBLE', double(2), range(3, 8, 12), { rest: 75, roundingKg: 2 }),
            slot(RENEGADE_ROW, 'renegade-row', 'DOUBLE', double(2), range(3, 8, 12), { rest: 75, roundingKg: 2 }),
            slot(BICEPS_CURL, 'biceps-curl', 'DOUBLE', double(1), range(2, 10, 15), { rest: 60, roundingKg: 1 }),
            slot(RUSSIAN_TWIST, 'russian-twist', 'DOUBLE', double(0, 'REPS'), range(3, 15, 20), { rest: 60 }),
          ],
        },
        {
          name: 'Workout C',
          exercises: [
            slot(DB_STIFF_LEG_DL, 'db-stiff-leg-dl', 'DOUBLE', double(2), range(3, 10, 15), { rest: 75, roundingKg: 2 }),
            slot(ARNOLD_PRESS, 'arnold-press', 'DOUBLE', double(2), range(3, 8, 12), { rest: 75, roundingKg: 2 }),
            slot(STEP_UP, 'step-up', 'DOUBLE', double(0, 'REPS'), range(3, 10, 15), { rest: 60 }),
            slot(HAMMER_CURL, 'hammer-curl', 'DOUBLE', double(1), range(2, 10, 15), { rest: 60, roundingKg: 1 }),
            slot(BURPEE, 'burpee', 'DOUBLE', double(0, 'REPS'), range(3, 8, 12), { rest: 60 }),
          ],
        },
      ],
    },
  ],
};
