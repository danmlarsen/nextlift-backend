import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PersonalRecordsService } from 'src/personal-records/personal-records.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { WorkoutExerciseService } from './workout-exercise.service';
import { WorkoutManagementService } from './workout-management.service';

describe('WorkoutManagementService', () => {
  let service: WorkoutManagementService;

  const workoutFindFirst = jest.fn();
  const workoutCreate = jest.fn();
  const templateFindFirst = jest.fn();
  const findPreviousWorkoutExercise = jest.fn();

  const prismaMock = {
    workout: { findFirst: workoutFindFirst, create: workoutCreate },
    workoutTemplate: { findFirst: templateFindFirst },
  };

  const userId = 7;

  const template = {
    id: 4,
    userId,
    name: 'Push Day',
    notes: 'template notes',
    workoutTemplateExercises: [
      {
        id: 9,
        exerciseId: 100,
        exerciseOrder: 2,
        notes: 'slow eccentric',
        workoutTemplateSets: [
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
      {
        id: 10,
        exerciseId: 200,
        exerciseOrder: 5,
        notes: null,
        workoutTemplateSets: [],
      },
    ],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    workoutFindFirst.mockResolvedValue(null);
    workoutCreate.mockResolvedValue({ id: 2, workoutExercises: [] });
    templateFindFirst.mockResolvedValue(template);
    findPreviousWorkoutExercise.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkoutManagementService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: PersonalRecordsService,
          useValue: { recomputeForExercises: jest.fn() },
        },
        {
          provide: WorkoutExerciseService,
          useValue: { findPreviousWorkoutExercise },
        },
        {
          provide: 'PinoLogger:WorkoutManagementService',
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<WorkoutManagementService>(WorkoutManagementService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createWorkoutFromTemplate', () => {
    it('rejects when an active workout already exists', async () => {
      workoutFindFirst.mockResolvedValue({
        id: 1,
        status: 'ACTIVE',
        startedAt: new Date(),
      });

      await expect(
        service.createWorkoutFromTemplate(userId, { templateId: 4 }),
      ).rejects.toThrow(ConflictException);
      expect(workoutCreate).not.toHaveBeenCalled();
    });

    it('rejects templates the user does not own', async () => {
      templateFindFirst.mockResolvedValue(null);

      await expect(
        service.createWorkoutFromTemplate(userId, { templateId: 4 }),
      ).rejects.toThrow(ForbiddenException);
      expect(templateFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 4, userId } }),
      );
      expect(workoutCreate).not.toHaveBeenCalled();
    });

    it('creates an active workout carrying the template structure as suggestions', async () => {
      findPreviousWorkoutExercise
        .mockResolvedValueOnce({ id: 55, workoutSets: [] })
        .mockResolvedValueOnce(null);

      await service.createWorkoutFromTemplate(userId, { templateId: 4 });

      expect(workoutCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            userId,
            status: 'ACTIVE',
            title: 'Push Day',
            notes: 'template notes',
            startedAt: expect.any(Date),
            workoutExercises: {
              create: [
                {
                  exerciseId: 100,
                  exerciseOrder: 1,
                  notes: 'slow eccentric',
                  previousWorkoutExerciseId: 55,
                  workoutSets: {
                    create: [
                      {
                        setNumber: 1,
                        type: 'warmup',
                        notes: null,
                        completed: false,
                        suggestedReps: 10,
                        suggestedWeight: 60,
                        suggestedDuration: null,
                      },
                      {
                        setNumber: 2,
                        type: 'normal',
                        notes: 'belt on',
                        completed: false,
                        suggestedReps: 5,
                        suggestedWeight: 100,
                        suggestedDuration: null,
                      },
                    ],
                  },
                },
                {
                  exerciseId: 200,
                  exerciseOrder: 2,
                  notes: null,
                  previousWorkoutExerciseId: undefined,
                  workoutSets: { create: [] },
                },
              ],
            },
          },
        }),
      );
    });

    it('shares one startedAt between the hint lookups and the created workout', async () => {
      await service.createWorkoutFromTemplate(userId, { templateId: 4 });

      const lookupInstants = findPreviousWorkoutExercise.mock.calls.map(
        (call: [number, number, Date]) => call[2],
      );
      const createArg = workoutCreate.mock.calls[0] as [
        { data: { startedAt: Date } },
      ];
      const createdStartedAt = createArg[0].data.startedAt;

      expect(findPreviousWorkoutExercise).toHaveBeenCalledTimes(2);
      expect(findPreviousWorkoutExercise).toHaveBeenCalledWith(
        userId,
        100,
        createdStartedAt,
      );
      expect(findPreviousWorkoutExercise).toHaveBeenCalledWith(
        userId,
        200,
        createdStartedAt,
      );
      for (const instant of lookupInstants) {
        expect(instant).toBe(createdStartedAt);
      }
    });
  });
});
