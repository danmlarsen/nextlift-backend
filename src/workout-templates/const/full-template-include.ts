import { Prisma } from '@prisma/client';

export const FULL_TEMPLATE_INCLUDE: Prisma.WorkoutTemplateInclude = {
  workoutTemplateExercises: {
    orderBy: { exerciseOrder: 'asc' },
    include: {
      exercise: true,
      workoutTemplateSets: {
        orderBy: [{ setNumber: 'asc' }, { createdAt: 'asc' }],
      },
    },
  },
} as const;
