import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { SYSTEM_USER_ID } from 'src/common/constants';
import { TemplateExerciseService } from './template-exercise.service';

describe('TemplateExerciseService', () => {
  let service: TemplateExerciseService;

  const templateFindFirst = jest.fn();
  const exerciseFindFirst = jest.fn();
  const templateExerciseAggregate = jest.fn();
  const templateExerciseFindUnique = jest.fn();
  const templateUpdate = jest.fn();

  const prismaMock = {
    workoutTemplate: { findFirst: templateFindFirst, update: templateUpdate },
    exercise: { findFirst: exerciseFindFirst },
    workoutTemplateExercise: {
      aggregate: templateExerciseAggregate,
      findUnique: templateExerciseFindUnique,
    },
  };

  const userId = 7;
  const templateId = 4;

  beforeEach(async () => {
    jest.clearAllMocks();
    templateFindFirst.mockResolvedValue({ id: templateId, userId });
    exerciseFindFirst.mockResolvedValue({ id: 100 });
    templateExerciseAggregate.mockResolvedValue({
      _max: { exerciseOrder: null },
    });
    templateUpdate.mockResolvedValue({
      id: templateId,
      workoutTemplateExercises: [],
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplateExerciseService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: 'PinoLogger:TemplateExerciseService',
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<TemplateExerciseService>(TemplateExerciseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createTemplateExercise', () => {
    it('checks exercise availability against own and system exercises', async () => {
      await service.createTemplateExercise(userId, templateId, {
        exerciseId: 100,
      });

      expect(exerciseFindFirst).toHaveBeenCalledWith({
        where: {
          id: 100,
          OR: [{ userId }, { userId: SYSTEM_USER_ID }],
        },
        select: { id: true },
      });
    });

    it('rejects exercises that are unavailable to the user', async () => {
      exerciseFindFirst.mockResolvedValue(null);

      await expect(
        service.createTemplateExercise(userId, templateId, { exerciseId: 100 }),
      ).rejects.toThrow(ForbiddenException);
      expect(templateUpdate).not.toHaveBeenCalled();
    });

    it('rejects templates the user does not own', async () => {
      templateFindFirst.mockResolvedValue(null);

      await expect(
        service.createTemplateExercise(userId, templateId, { exerciseId: 100 }),
      ).rejects.toThrow(ForbiddenException);
      expect(templateUpdate).not.toHaveBeenCalled();
    });

    it('appends after the highest order, tolerating gaps, and seeds one set', async () => {
      templateExerciseAggregate.mockResolvedValue({
        _max: { exerciseOrder: 5 },
      });

      await service.createTemplateExercise(userId, templateId, {
        exerciseId: 100,
      });

      expect(templateUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: templateId },
          data: {
            workoutTemplateExercises: {
              create: {
                exerciseId: 100,
                exerciseOrder: 6,
                workoutTemplateSets: {
                  create: [{ setNumber: 1 }],
                },
              },
            },
          },
        }),
      );
    });
  });

  describe('updateTemplateExercise', () => {
    it('rejects template exercises the user does not own', async () => {
      templateExerciseFindUnique.mockResolvedValue({
        id: 9,
        workoutTemplateId: templateId,
        workoutTemplate: { id: templateId, userId: userId + 1 },
      });

      await expect(
        service.updateTemplateExercise(userId, 9, { notes: 'tempo 3-1-1' }),
      ).rejects.toThrow(ForbiddenException);
      expect(templateUpdate).not.toHaveBeenCalled();
    });
  });

  describe('deleteTemplateExercise', () => {
    it('deletes through the parent without resequencing the remaining order', async () => {
      templateExerciseFindUnique.mockResolvedValue({
        id: 9,
        workoutTemplateId: templateId,
        workoutTemplate: { id: templateId, userId },
      });

      await service.deleteTemplateExercise(userId, 9);

      expect(templateUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: templateId },
          data: {
            workoutTemplateExercises: {
              delete: { id: 9 },
            },
          },
        }),
      );
    });
  });
});
