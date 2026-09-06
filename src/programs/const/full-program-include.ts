import { Prisma } from '@prisma/client';

export const PROGRAM_EXERCISE_SELECT = {
  id: true,
  name: true,
  equipment: true,
  category: true,
} satisfies Prisma.ExerciseSelect;

/** The whole program tree, ordered the way the engine and the editor read it. */
export const FULL_PROGRAM_INCLUDE = {
  blocks: {
    orderBy: { blockOrder: 'asc' },
    include: {
      weeks: { orderBy: { weekInBlock: 'asc' } },
      days: {
        orderBy: { dayOrder: 'asc' },
        include: {
          exercises: {
            orderBy: { exerciseOrder: 'asc' },
            include: {
              exercise: { select: PROGRAM_EXERCISE_SELECT },
              sets: { orderBy: [{ weekInBlock: 'asc' }, { setOrder: 'asc' }] },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.ProgramInclude;

export type ProgramWithTree = Prisma.ProgramGetPayload<{
  include: typeof FULL_PROGRAM_INCLUDE;
}>;

export type ProgramDayWithContent =
  ProgramWithTree['blocks'][number]['days'][number];

/** Summary shape for lists: no tree, just week counts per block. */
export const PROGRAM_SUMMARY_INCLUDE = {
  blocks: { select: { _count: { select: { weeks: true } } } },
} satisfies Prisma.ProgramInclude;

export type ProgramSummaryRow = Prisma.ProgramGetPayload<{
  include: typeof PROGRAM_SUMMARY_INCLUDE;
}>;
