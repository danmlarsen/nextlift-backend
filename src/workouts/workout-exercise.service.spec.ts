import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PersonalRecordsService } from 'src/personal-records/personal-records.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { WorkoutExerciseService } from './workout-exercise.service';

describe('WorkoutExerciseService', () => {
  let service: WorkoutExerciseService;

  const workoutFindFirst = jest.fn();
  const exerciseFindFirst = jest.fn();
  const workoutExerciseAggregate = jest.fn();
  const workoutExerciseFindFirst = jest.fn();
  const workoutUpdate = jest.fn();

  const prismaMock = {
    workout: { findFirst: workoutFindFirst, update: workoutUpdate },
    exercise: { findFirst: exerciseFindFirst },
    workoutExercise: {
      aggregate: workoutExerciseAggregate,
      findFirst: workoutExerciseFindFirst,
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    workoutFindFirst.mockResolvedValue({
      id: 2,
      userId: 7,
      startedAt: new Date('2026-08-01T10:00:00Z'),
    });
    exerciseFindFirst.mockResolvedValue({ id: 11 });
    workoutExerciseAggregate.mockResolvedValue({
      _max: { exerciseOrder: null },
    });
    workoutExerciseFindFirst.mockResolvedValue(null);
    workoutUpdate.mockResolvedValue({ id: 2, workoutExercises: [] });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkoutExerciseService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: PersonalRecordsService, useValue: {} },
        {
          provide: 'PinoLogger:WorkoutExerciseService',
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<WorkoutExerciseService>(WorkoutExerciseService);
  });

  it('allows exercises owned by the user or provided by the system', async () => {
    await service.createWorkoutExercise(7, 2, { exerciseId: 11 });

    expect(exerciseFindFirst).toHaveBeenCalledWith({
      where: {
        id: 11,
        OR: [{ userId: 7 }, { userId: -1 }],
      },
      select: { id: true },
    });
    expect(workoutUpdate).toHaveBeenCalled();
  });

  it("rejects another user's private exercise before attaching it", async () => {
    exerciseFindFirst.mockResolvedValue(null);

    await expect(
      service.createWorkoutExercise(7, 2, { exerciseId: 99 }),
    ).rejects.toThrow(ForbiddenException);

    expect(workoutExerciseAggregate).not.toHaveBeenCalled();
    expect(workoutUpdate).not.toHaveBeenCalled();
  });

  it('rejects adding an exercise to a workout the user does not own', async () => {
    workoutFindFirst.mockResolvedValue(null);

    await expect(
      service.createWorkoutExercise(7, 2, { exerciseId: 11 }),
    ).rejects.toThrow(ForbiddenException);

    expect(workoutExerciseAggregate).not.toHaveBeenCalled();
    expect(workoutUpdate).not.toHaveBeenCalled();
  });
});
