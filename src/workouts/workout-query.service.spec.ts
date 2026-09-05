import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { WorkoutQueryService } from './workout-query.service';

describe('WorkoutQueryService', () => {
  let service: WorkoutQueryService;

  const workoutFindMany = jest.fn();

  const prismaMock = {
    workout: { findMany: workoutFindMany },
  };

  const userId = 7;

  const makeSet = (overrides: Record<string, unknown>) => ({
    type: 'normal',
    completed: true,
    reps: null,
    weight: null,
    duration: null,
    ...overrides,
  });

  const makeExercise = (
    category: 'strength' | 'cardio',
    workoutSets: ReturnType<typeof makeSet>[],
  ) => ({
    id: 1,
    exercise: {
      name: category === 'strength' ? 'Bench Press' : 'Rowing',
      category,
    },
    workoutSets,
  });

  const makeWorkout = (
    id: number,
    workoutExercises: ReturnType<typeof makeExercise>[],
  ) => ({
    id,
    userId,
    status: 'COMPLETED',
    startedAt: new Date('2026-08-01T10:00:00Z'),
    workoutExercises,
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkoutQueryService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: 'PinoLogger:WorkoutQueryService',
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<WorkoutQueryService>(WorkoutQueryService);
  });

  describe('getCompletedWorkouts', () => {
    it('summarizes a workout containing an exercise with no sets', async () => {
      // Regression: an exercise whose last set was removed before completion
      // used to fail the whole history request with an empty-reduce TypeError.
      workoutFindMany.mockResolvedValue([
        makeWorkout(1, [
          makeExercise('strength', []),
          makeExercise('cardio', []),
          makeExercise('strength', [
            makeSet({ weight: 60, reps: 10 }),
            makeSet({ weight: 100, reps: 5 }),
          ]),
        ]),
      ]);

      const result = await service.getCompletedWorkouts(userId);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].totalCompletedSets).toBe(2);
      expect(result.data[0].totalWeight).toBe(60 * 10 + 100 * 5);
      expect(result.data[0].workoutExercises).toHaveLength(1);
      expect(result.data[0].workoutExercises[0].exerciseName).toBe(
        'Bench Press',
      );
      expect(result.data[0].workoutExercises[0].sets).toBe(2);
      expect(result.data[0].workoutExercises[0].bestSet).toEqual(
        expect.objectContaining({ weight: 100, reps: 5 }),
      );
    });

    it('picks the longest set as best for cardio exercises', async () => {
      workoutFindMany.mockResolvedValue([
        makeWorkout(1, [
          makeExercise('cardio', [
            makeSet({ duration: 10 }),
            makeSet({ duration: 30 }),
          ]),
        ]),
      ]);

      const result = await service.getCompletedWorkouts(userId);

      expect(result.data[0].workoutExercises[0].bestSet).toEqual(
        expect.objectContaining({ duration: 30 }),
      );
    });
  });
});
