import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { TemplateSetService } from './template-set.service';

describe('TemplateSetService', () => {
  let service: TemplateSetService;

  const templateExerciseFindUnique = jest.fn();
  const templateSetFindUnique = jest.fn();
  const templateSetAggregate = jest.fn();
  const templateSetUpdateMany = jest.fn();
  const templateUpdate = jest.fn();
  const transaction = jest.fn();

  const prismaMock = {
    workoutTemplateExercise: { findUnique: templateExerciseFindUnique },
    workoutTemplateSet: { findUnique: templateSetFindUnique },
    workoutTemplate: { update: templateUpdate },
    $transaction: transaction,
  };

  const userId = 7;
  const templateId = 4;
  const templateExerciseId = 9;

  const existingSet = {
    id: 20,
    workoutTemplateExerciseId: templateExerciseId,
    setNumber: 2,
    workoutTemplateExercise: {
      id: templateExerciseId,
      workoutTemplateId: templateId,
      workoutTemplate: { id: templateId, userId },
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    templateUpdate.mockResolvedValue({
      id: templateId,
      workoutTemplateExercises: [],
    });
    transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          workoutTemplateSet: {
            aggregate: templateSetAggregate,
            updateMany: templateSetUpdateMany,
          },
          workoutTemplate: { update: templateUpdate },
        }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplateSetService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: 'PinoLogger:TemplateSetService',
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<TemplateSetService>(TemplateSetService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createTemplateSet', () => {
    it('rejects template exercises the user does not own', async () => {
      templateExerciseFindUnique.mockResolvedValue(null);

      await expect(
        service.createTemplateSet(
          templateExerciseId,
          userId,
          {} as Parameters<typeof service.createTemplateSet>[2],
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(templateUpdate).not.toHaveBeenCalled();
    });

    it('appends the next set number inside a transaction', async () => {
      templateExerciseFindUnique.mockResolvedValue({
        id: templateExerciseId,
        workoutTemplateId: templateId,
        workoutTemplate: { id: templateId, userId },
      });
      templateSetAggregate.mockResolvedValue({ _max: { setNumber: 3 } });

      await service.createTemplateSet(
        templateExerciseId,
        userId,
        {} as Parameters<typeof service.createTemplateSet>[2],
      );

      expect(templateUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: templateId },
          data: {
            workoutTemplateExercises: {
              update: {
                where: { id: templateExerciseId },
                data: {
                  workoutTemplateSets: {
                    create: expect.objectContaining({
                      setNumber: 4,
                    }) as object,
                  },
                },
              },
            },
          },
        }),
      );
    });
  });

  describe('updateTemplateSet', () => {
    it('rejects template sets the user does not own', async () => {
      templateSetFindUnique.mockResolvedValue({
        ...existingSet,
        workoutTemplateExercise: {
          ...existingSet.workoutTemplateExercise,
          workoutTemplate: { id: templateId, userId: userId + 1 },
        },
      });

      await expect(
        service.updateTemplateSet(20, userId, {
          reps: 5,
        } as Parameters<typeof service.updateTemplateSet>[2]),
      ).rejects.toThrow(ForbiddenException);
      expect(templateUpdate).not.toHaveBeenCalled();
    });
  });

  describe('deleteTemplateSet', () => {
    it('decrements later set numbers and deletes through the parent', async () => {
      templateSetFindUnique.mockResolvedValue(existingSet);

      await service.deleteTemplateSet(20, userId);

      expect(templateSetUpdateMany).toHaveBeenCalledWith({
        where: {
          workoutTemplateExerciseId: templateExerciseId,
          setNumber: { gt: 2 },
        },
        data: { setNumber: { decrement: 1 } },
      });
      expect(templateUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: templateId },
          data: {
            workoutTemplateExercises: {
              update: {
                where: { id: templateExerciseId },
                data: {
                  workoutTemplateSets: {
                    delete: { id: 20 },
                  },
                },
              },
            },
          },
        }),
      );
    });
  });
});
