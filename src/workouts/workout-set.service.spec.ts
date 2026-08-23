import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PersonalRecordsService } from 'src/personal-records/personal-records.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { UpdateWorkoutSetDto } from './dtos/update-workout-set.dto';
import { WorkoutSetService } from './workout-set.service';

// The DTO fields are runtime-optional (@IsOptional); absent fields arrive as
// undefined, which this models without listing every property.
const asUpdateDto = (data: Partial<UpdateWorkoutSetDto>) =>
  data as UpdateWorkoutSetDto;

describe('WorkoutSetService', () => {
  let service: WorkoutSetService;

  const workoutSetFindUnique = jest.fn();
  const workoutSetUpdateMany = jest.fn();
  const workoutUpdate = jest.fn();
  const personalRecordCount = jest.fn();
  const transaction = jest.fn();
  const handleSetWrite = jest.fn();
  const recomputeForExercises = jest.fn();

  const prismaMock = {
    workoutSet: { findUnique: workoutSetFindUnique },
    workout: { update: workoutUpdate },
    personalRecord: { count: personalRecordCount },
    $transaction: transaction,
  };

  const userId = 7;
  const startedAt = new Date('2026-08-01T10:00:00Z');

  const existingSet = {
    id: 10,
    workoutExerciseId: 3,
    setNumber: 2,
    completed: false,
    type: 'normal',
    weight: 100,
    reps: 5,
    duration: null,
    workoutExercise: {
      id: 3,
      workoutId: 2,
      exerciseId: 1,
      exercise: { name: 'Bench Press' },
      workout: { id: 2, userId, startedAt },
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    workoutUpdate.mockResolvedValue({ id: 2, workoutExercises: [] });
    transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          workoutSet: { updateMany: workoutSetUpdateMany },
          workout: { update: workoutUpdate },
        }),
    );
    handleSetWrite.mockResolvedValue([]);
    recomputeForExercises.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkoutSetService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: PersonalRecordsService,
          useValue: { handleSetWrite, recomputeForExercises },
        },
        {
          provide: 'PinoLogger:WorkoutSetService',
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<WorkoutSetService>(WorkoutSetService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('updateWorkoutSet', () => {
    it('rejects sets the user does not own', async () => {
      workoutSetFindUnique.mockResolvedValue(null);

      await expect(
        service.updateWorkoutSet(10, userId, asUpdateDto({ completed: true })),
      ).rejects.toThrow(ForbiddenException);
      expect(handleSetWrite).not.toHaveBeenCalled();
    });

    it('runs record detection on the merged set state and attaches newRecords', async () => {
      workoutSetFindUnique.mockResolvedValue(existingSet);
      const record = { recordType: 'MAX_WEIGHT', value: 105 };
      handleSetWrite.mockResolvedValue([record]);

      const result = await service.updateWorkoutSet(
        10,
        userId,
        asUpdateDto({ weight: 105, completed: true }),
      );

      expect(handleSetWrite).toHaveBeenCalledWith(userId, {
        exerciseId: 1,
        exerciseName: 'Bench Press',
        workoutStartedAt: startedAt,
        set: {
          id: 10,
          completed: true,
          type: 'normal',
          weight: 105,
          // Not part of the update, so carried over from the stored set.
          reps: 5,
          duration: null,
        },
      });
      expect(result.newRecords).toEqual([record]);
    });

    it('still resolves with the workout when record detection throws', async () => {
      workoutSetFindUnique.mockResolvedValue(existingSet);
      handleSetWrite.mockRejectedValue(new Error('records exploded'));

      const result = await service.updateWorkoutSet(
        10,
        userId,
        asUpdateDto({ completed: true }),
      );

      expect(result).toEqual({ id: 2, workoutExercises: [], newRecords: [] });
    });
  });

  describe('deleteWorkoutSet', () => {
    it('skips recompute when the set holds no record', async () => {
      workoutSetFindUnique.mockResolvedValue(existingSet);
      personalRecordCount.mockResolvedValue(0);

      await service.deleteWorkoutSet(10, userId);

      expect(recomputeForExercises).not.toHaveBeenCalled();
    });

    it('recomputes the exercise when the deleted set held a record', async () => {
      workoutSetFindUnique.mockResolvedValue(existingSet);
      personalRecordCount.mockResolvedValue(1);

      await service.deleteWorkoutSet(10, userId);

      expect(personalRecordCount).toHaveBeenCalledWith({
        where: { workoutSetId: 10 },
      });
      expect(recomputeForExercises).toHaveBeenCalledWith(userId, [1]);
    });

    it('recomputes anyway when the record lookup fails', async () => {
      workoutSetFindUnique.mockResolvedValue(existingSet);
      personalRecordCount.mockRejectedValue(new Error('db hiccup'));

      await service.deleteWorkoutSet(10, userId);

      expect(recomputeForExercises).toHaveBeenCalledWith(userId, [1]);
    });
  });
});
