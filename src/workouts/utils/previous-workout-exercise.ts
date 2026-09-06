import { PrismaClient } from '@prisma/client';

export type PreviousWorkoutExercise = {
  id: number;
  workoutSets: { setNumber: number }[];
};

type PrismaLike = Pick<PrismaClient, 'workoutExercise'>;

/**
 * The most recent completed occurrence of an exercise before the given
 * instant, with its completed sets. Shared by the workouts and programs
 * modules so a generated workout can link "last time" hints the same way.
 */
export function findPreviousWorkoutExercise(
  prisma: PrismaLike,
  userId: number,
  exerciseId: number,
  currentWorkoutStartedAt: Date,
): Promise<PreviousWorkoutExercise | null> {
  return prisma.workoutExercise.findFirst({
    where: {
      exerciseId,
      workout: {
        userId,
        status: 'COMPLETED',
        startedAt: {
          lt: currentWorkoutStartedAt,
        },
      },
    },
    include: {
      workoutSets: {
        where: { completed: true },
        orderBy: { setNumber: 'asc' },
      },
    },
    orderBy: {
      workout: {
        startedAt: 'desc',
      },
    },
  });
}
