import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { ExercisesService } from './exercises.service';

describe('ExercisesService', () => {
  let service: ExercisesService;
  let prisma: {
    $queryRaw: jest.Mock;
    exercise: { findFirst: jest.Mock };
    exerciseFavorite: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      upsert: jest.Mock;
      deleteMany: jest.Mock;
    };
    workout: { count: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      $queryRaw: jest.fn(),
      exercise: { findFirst: jest.fn() },
      exerciseFavorite: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      workout: { count: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExercisesService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: 'PinoLogger:ExercisesService',
          useValue: {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ExercisesService>(ExercisesService);
  });

  it('paginates the globally ranked exercise results by offset', async () => {
    const exercises = Array.from({ length: 21 }, (_, index) => ({
      id: index + 1,
      name: `Exercise ${index + 1}`,
      isFavorite: index < 2,
      timesUsed: 21 - index,
    }));
    prisma.$queryRaw.mockResolvedValue(exercises);

    const result = await service.findAllExercises(42, { cursor: 20 });

    expect(result.data).toHaveLength(20);
    expect(result.meta).toEqual({ hasNextPage: true, nextCursor: 40 });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('counts distinct completed workouts and returns favorite state in details', async () => {
    prisma.exercise.findFirst.mockResolvedValue({ id: 7, name: 'Deadlift' });
    prisma.workout.count.mockResolvedValue(4);
    prisma.exerciseFavorite.findUnique.mockResolvedValue({ exerciseId: 7 });

    await expect(service.findExerciseById(42, 7)).resolves.toEqual({
      id: 7,
      name: 'Deadlift',
      isFavorite: true,
      timesUsed: 4,
    });
    expect(prisma.workout.count).toHaveBeenCalledWith({
      where: {
        userId: 42,
        status: 'COMPLETED',
        workoutExercises: { some: { exerciseId: 7 } },
      },
    });
  });

  it('returns only the current user favorite IDs', async () => {
    prisma.exerciseFavorite.findMany.mockResolvedValue([
      { exerciseId: 3 },
      { exerciseId: 9 },
    ]);

    await expect(service.getFavoriteExerciseIds(42)).resolves.toEqual({
      exerciseIds: [3, 9],
    });
    expect(prisma.exerciseFavorite.findMany).toHaveBeenCalledWith({
      where: { userId: 42 },
      select: { exerciseId: true },
    });
  });

  it('favorites an available exercise idempotently for the current user', async () => {
    prisma.exercise.findFirst.mockResolvedValue({ id: 7 });
    prisma.exerciseFavorite.upsert.mockResolvedValue({});

    await expect(service.favoriteExercise(42, 7)).resolves.toEqual({
      exerciseId: 7,
      isFavorite: true,
    });
    expect(prisma.exerciseFavorite.upsert).toHaveBeenCalledWith({
      where: { userId_exerciseId: { userId: 42, exerciseId: 7 } },
      create: { userId: 42, exerciseId: 7 },
      update: {},
    });
  });

  it('does not favorite another user unavailable custom exercise', async () => {
    prisma.exercise.findFirst.mockResolvedValue(null);

    await expect(service.favoriteExercise(42, 7)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.exerciseFavorite.upsert).not.toHaveBeenCalled();
  });

  it('unfavorites idempotently within the current user scope', async () => {
    prisma.exercise.findFirst.mockResolvedValue({ id: 7 });
    prisma.exerciseFavorite.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.unfavoriteExercise(42, 7)).resolves.toEqual({
      exerciseId: 7,
      isFavorite: false,
    });
    expect(prisma.exerciseFavorite.deleteMany).toHaveBeenCalledWith({
      where: { userId: 42, exerciseId: 7 },
    });
  });
});
