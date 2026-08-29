import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { MAX_TEMPLATES_PER_USER } from 'src/common/constants';
import { TemplateManagementService } from './template-management.service';

describe('TemplateManagementService', () => {
  let service: TemplateManagementService;

  const templateFindMany = jest.fn();
  const templateFindFirst = jest.fn();
  const templateCount = jest.fn();
  const templateCreate = jest.fn();
  const templateUpdate = jest.fn();
  const templateDelete = jest.fn();
  const workoutFindFirst = jest.fn();

  const prismaMock = {
    workoutTemplate: {
      findMany: templateFindMany,
      findFirst: templateFindFirst,
      count: templateCount,
      create: templateCreate,
      update: templateUpdate,
      delete: templateDelete,
    },
    workout: { findFirst: workoutFindFirst },
  };

  const userId = 7;

  beforeEach(async () => {
    jest.clearAllMocks();
    templateCount.mockResolvedValue(0);
    templateCreate.mockResolvedValue({ id: 1, workoutTemplateExercises: [] });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplateManagementService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: 'PinoLogger:TemplateManagementService',
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<TemplateManagementService>(TemplateManagementService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createWorkoutTemplate', () => {
    it('rejects creation at the template cap', async () => {
      templateCount.mockResolvedValue(MAX_TEMPLATES_PER_USER);

      await expect(
        service.createWorkoutTemplate(userId, {
          name: 'Push Day',
          notes: undefined as unknown as string,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(templateCreate).not.toHaveBeenCalled();
    });

    it('creates a template owned by the user', async () => {
      await service.createWorkoutTemplate(userId, {
        name: 'Push Day',
        notes: undefined as unknown as string,
      });

      expect(templateCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'Push Day', userId }) as object,
        }),
      );
    });
  });

  describe('createTemplateFromWorkout', () => {
    const workout = {
      id: 2,
      userId,
      notes: 'good session',
      workoutExercises: [
        {
          id: 30,
          exerciseId: 100,
          // Gap from a deleted exercise; the snapshot renumbers to 1..n.
          exerciseOrder: 2,
          notes: 'slow eccentric',
          workoutSets: [
            {
              setNumber: 1,
              type: 'warmup',
              reps: 10,
              weight: 60,
              duration: null,
              notes: null,
              completed: true,
            },
            {
              setNumber: 3,
              type: 'normal',
              reps: 5,
              weight: 100,
              duration: null,
              notes: 'belt on',
              // Uncompleted sets are part of the structure and still copied.
              completed: false,
            },
          ],
        },
        {
          id: 31,
          exerciseId: 200,
          exerciseOrder: 5,
          notes: null,
          workoutSets: [],
        },
      ],
    };

    it('rejects workouts the user does not own', async () => {
      workoutFindFirst.mockResolvedValue(null);

      await expect(
        service.createTemplateFromWorkout(userId, {
          workoutId: 2,
          name: 'Push Day',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(templateCreate).not.toHaveBeenCalled();
    });

    it('rejects snapshots at the template cap', async () => {
      workoutFindFirst.mockResolvedValue(workout);
      templateCount.mockResolvedValue(MAX_TEMPLATES_PER_USER);

      await expect(
        service.createTemplateFromWorkout(userId, {
          workoutId: 2,
          name: 'Push Day',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('snapshots exercises and sets renumbered, without the completed flag', async () => {
      workoutFindFirst.mockResolvedValue(workout);

      await service.createTemplateFromWorkout(userId, {
        workoutId: 2,
        name: 'Push Day',
      });

      expect(templateCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            userId,
            name: 'Push Day',
            notes: 'good session',
            workoutTemplateExercises: {
              create: [
                {
                  exerciseId: 100,
                  exerciseOrder: 1,
                  notes: 'slow eccentric',
                  workoutTemplateSets: {
                    create: [
                      {
                        setNumber: 1,
                        type: 'warmup',
                        reps: 10,
                        weight: 60,
                        duration: null,
                        notes: null,
                      },
                      {
                        setNumber: 2,
                        type: 'normal',
                        reps: 5,
                        weight: 100,
                        duration: null,
                        notes: 'belt on',
                      },
                    ],
                  },
                },
                {
                  exerciseId: 200,
                  exerciseOrder: 2,
                  notes: null,
                  workoutTemplateSets: { create: [] },
                },
              ],
            },
          },
        }),
      );
    });

    it('creates an empty template from a workout with no exercises', async () => {
      workoutFindFirst.mockResolvedValue({ ...workout, workoutExercises: [] });

      await service.createTemplateFromWorkout(userId, {
        workoutId: 2,
        name: 'Push Day',
      });

      expect(templateCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workoutTemplateExercises: { create: [] },
          }) as object,
        }),
      );
    });
  });

  describe('updateWorkoutTemplate', () => {
    it('rejects templates the user does not own', async () => {
      templateFindFirst.mockResolvedValue(null);

      await expect(
        service.updateWorkoutTemplate(userId, 1, {
          name: 'Renamed',
        } as Parameters<typeof service.updateWorkoutTemplate>[2]),
      ).rejects.toThrow(ForbiddenException);
      expect(templateUpdate).not.toHaveBeenCalled();
    });
  });

  describe('deleteWorkoutTemplate', () => {
    it('rejects templates the user does not own', async () => {
      templateFindFirst.mockResolvedValue(null);

      await expect(service.deleteWorkoutTemplate(userId, 1)).rejects.toThrow(
        ForbiddenException,
      );
      expect(templateDelete).not.toHaveBeenCalled();
    });

    it('returns the deleted template', async () => {
      templateFindFirst.mockResolvedValue({ id: 1, userId });
      templateDelete.mockResolvedValue({ id: 1, name: 'Push Day' });

      const result = await service.deleteWorkoutTemplate(userId, 1);

      expect(templateDelete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1, userId } }),
      );
      expect(result).toEqual({ id: 1, name: 'Push Day' });
    });
  });
});
