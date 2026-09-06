import { Prisma } from '@prisma/client';

export const FULL_WORKOUT_INCLUDE: Prisma.WorkoutInclude = {
  workoutExercises: {
    orderBy: { exerciseOrder: 'asc' },
    include: {
      exercise: true,
      workoutSets: {
        orderBy: [{ setNumber: 'asc' }, { createdAt: 'asc' }],
      },
      previousWorkoutExercise: {
        include: {
          workoutSets: {
            where: { completed: true },
            orderBy: { setNumber: 'asc' },
          },
        },
      },
    },
  },
  // Present only for workouts generated from a program day.
  programDayLog: {
    select: {
      id: true,
      enrollmentId: true,
      cycle: true,
      weekIndex: true,
      dayIndex: true,
      dayName: true,
      status: true,
    },
  },
} as const;
