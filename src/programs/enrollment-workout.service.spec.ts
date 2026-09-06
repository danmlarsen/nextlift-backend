import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  gzclpProgram,
  makeState,
  resetFixtureIds,
} from './engine/testing/fixtures';
import {
  EnrollmentWorkoutService,
  stateUpsert,
  toStateMap,
} from './enrollment-workout.service';

/** Typed asymmetric matcher so nested matchers are not `any` for the linter. */
const containing = (value: Record<string, unknown>): object =>
  expect.objectContaining(value) as object;

type SetCreate = {
  setNumber: number;
  programSetId: number;
  suggestedReps: number | null;
  suggestedWeight: number | null;
  suggestedAmrap: boolean;
  suggestedRestSeconds: number | null;
  completed: boolean;
};
type ExerciseCreate = {
  exerciseId: number;
  exerciseOrder: number;
  progressionKey: string;
  previousWorkoutExerciseId?: number;
  workoutSets: { create: SetCreate[] };
};
type WorkoutCreateArgs = {
  data: {
    userId: number;
    status: string;
    title: string;
    programDayLogId: number;
    startedAt: Date;
    workoutExercises: { create: ExerciseCreate[] };
  };
};
type PreviousLookupArgs = { where: { workout: { startedAt: { lt: Date } } } };

describe('EnrollmentWorkoutService', () => {
  let service: EnrollmentWorkoutService;

  const workoutFindFirst = jest.fn();
  const workoutCreate = jest.fn();
  const enrollmentFindFirst = jest.fn();
  const enrollmentFindUnique = jest.fn();
  const enrollmentUpdate = jest.fn();
  const logFindUnique = jest.fn();
  const logFindFirst = jest.fn();
  const logCreate = jest.fn();
  const logUpdate = jest.fn();
  const logDelete = jest.fn();
  const exerciseFindMany = jest.fn();
  const workoutExerciseFindFirst = jest.fn();
  const stateUpsertMock = jest.fn();
  const transaction = jest.fn();

  const prismaMock = {
    workout: { findFirst: workoutFindFirst, create: workoutCreate },
    programEnrollment: {
      findFirst: enrollmentFindFirst,
      findUnique: enrollmentFindUnique,
      update: enrollmentUpdate,
    },
    programEnrollmentDayLog: {
      findUnique: logFindUnique,
      findFirst: logFindFirst,
      create: logCreate,
      update: logUpdate,
      delete: logDelete,
    },
    programEnrollmentExerciseState: { upsert: stateUpsertMock },
    exercise: { findMany: exerciseFindMany },
    workoutExercise: { findFirst: workoutExerciseFindFirst },
    $transaction: transaction,
  };

  const userId = 7;
  const enrollmentId = 11;
  const snapshot = gzclpProgram();
  const stateRows = () => [
    {
      ...makeState({
        progressionKey: 't1-squat',
        exerciseId: 1,
        workingWeight: 60,
      }),
      id: 1,
    },
    {
      ...makeState({
        progressionKey: 't2-bench',
        exerciseId: 2,
        workingWeight: 40,
      }),
      id: 2,
    },
    {
      ...makeState({
        progressionKey: 't3-lat-pulldown',
        exerciseId: 3,
        workingWeight: 30,
      }),
      id: 3,
    },
  ];
  const enrollment = (overrides: Record<string, unknown> = {}) => ({
    id: enrollmentId,
    userId,
    status: 'ACTIVE',
    programName: 'Tiered',
    snapshot,
    currentCycle: 1,
    currentWeekIndex: 1,
    currentDayIndex: 1,
    states: stateRows(),
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    resetFixtureIds();
    workoutFindFirst.mockResolvedValue(null);
    enrollmentFindFirst.mockResolvedValue(enrollment());
    logFindUnique.mockResolvedValue(null);
    logCreate.mockResolvedValue({ id: 99 });
    exerciseFindMany.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    workoutExerciseFindFirst.mockResolvedValue(null);
    workoutCreate.mockResolvedValue({ id: 500 });
    transaction.mockImplementation(async (arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => Promise<unknown>)(prismaMock)
        : Promise.all(arg as Promise<unknown>[]),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnrollmentWorkoutService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: 'PinoLogger:EnrollmentWorkoutService',
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    }).compile();
    service = module.get(EnrollmentWorkoutService);
  });

  describe('startWorkout', () => {
    it('refuses when an active workout exists', async () => {
      workoutFindFirst.mockResolvedValue({ id: 1 });
      await expect(
        service.startWorkout(userId, enrollmentId, {}),
      ).rejects.toThrow(ConflictException);
    });

    it('refuses enrollments that are not the user’s active one', async () => {
      enrollmentFindFirst.mockResolvedValue(null);
      await expect(
        service.startWorkout(userId, enrollmentId, {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects invalid positions and already completed days', async () => {
      await expect(
        service.startWorkout(userId, enrollmentId, {
          weekIndex: 9,
          dayIndex: 1,
        }),
      ).rejects.toThrow(BadRequestException);
      logFindUnique.mockResolvedValue({
        id: 5,
        status: 'COMPLETED',
        workout: null,
      });
      await expect(
        service.startWorkout(userId, enrollmentId, {}),
      ).rejects.toThrow(ConflictException);
    });

    it('asks for a swap when an exercise no longer exists', async () => {
      exerciseFindMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      await expect(
        service.startWorkout(userId, enrollmentId, {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates the day log and a workout carrying the prescriptions', async () => {
      workoutExerciseFindFirst.mockResolvedValueOnce({
        id: 77,
        workoutSets: [],
      });

      await service.startWorkout(userId, enrollmentId, {});

      expect(logCreate).toHaveBeenCalledWith({
        data: containing({
          enrollmentId,
          cycle: 1,
          weekIndex: 1,
          dayIndex: 1,
          dayName: 'A1',
          status: 'STARTED',
        }),
      });
      const { data } = (workoutCreate.mock.calls[0] as [WorkoutCreateArgs])[0];
      expect(data).toMatchObject({
        userId,
        status: 'ACTIVE',
        title: 'Tiered · A1',
        programDayLogId: 99,
      });
      const [squat, bench, pulldown] = data.workoutExercises.create;
      expect(squat).toMatchObject({
        exerciseId: 1,
        exerciseOrder: 1,
        progressionKey: 't1-squat',
        previousWorkoutExerciseId: 77,
      });
      expect(squat.workoutSets.create).toHaveLength(5);
      expect(squat.workoutSets.create[4]).toMatchObject({
        setNumber: 5,
        suggestedReps: 3,
        suggestedWeight: 60,
        suggestedAmrap: true,
        suggestedRestSeconds: 180,
        completed: false,
      });
      expect(squat.workoutSets.create[4].programSetId).toEqual(
        expect.any(Number),
      );
      expect(bench.workoutSets.create[0]).toMatchObject({
        suggestedWeight: 40,
        suggestedReps: 10,
      });
      expect(pulldown.progressionKey).toBe('t3-lat-pulldown');
      // Same instant for the lookups and the workout.
      expect(
        (workoutExerciseFindFirst.mock.calls[0] as [PreviousLookupArgs])[0]
          .where.workout.startedAt.lt,
      ).toBe(data.startedAt);
    });

    it('reuses a skipped day log', async () => {
      logFindUnique.mockResolvedValue({
        id: 5,
        status: 'SKIPPED',
        workout: null,
      });
      logUpdate.mockResolvedValue({ id: 5 });
      await service.startWorkout(userId, enrollmentId, {
        weekIndex: 1,
        dayIndex: 1,
      });
      expect(logUpdate).toHaveBeenCalledWith(
        containing({
          where: { id: 5 },
          data: containing({ status: 'STARTED' }),
        }),
      );
      expect(logCreate).not.toHaveBeenCalled();
      expect(
        (workoutCreate.mock.calls[0] as [WorkoutCreateArgs])[0].data
          .programDayLogId,
      ).toBe(5);
    });
  });

  describe('onWorkoutCompleted', () => {
    const programSetIds = () => {
      const day = snapshot.blocks[0].days[0];
      return {
        squat: day.exercises[0].sets.map((set) => set.id),
        bench: day.exercises[1].sets.map((set) => set.id),
        pulldown: day.exercises[2].sets.map((set) => set.id),
      };
    };

    const completedWorkout = (
      options: { amrapReps?: number; benchReps?: number } = {},
    ) => {
      const ids = programSetIds();
      const set = (
        programSetId: number,
        reps: number,
        weight: number,
        suggestedReps: number,
        amrap = false,
      ) => ({
        programSetId,
        type: 'normal',
        completed: true,
        reps,
        weight,
        rpe: null,
        suggestedReps,
        suggestedRepsMax: suggestedReps,
        suggestedAmrap: amrap,
        suggestedWeight: weight,
        suggestedRpe: null,
      });
      return {
        id: 500,
        userId,
        programDayLog: {
          id: 99,
          enrollmentId,
          cycle: 1,
          weekIndex: 1,
          dayIndex: 1,
          status: 'STARTED',
        },
        workoutExercises: [
          {
            workoutSets: ids.squat.map((id, index) =>
              set(
                id,
                index === 4 ? (options.amrapReps ?? 5) : 3,
                60,
                3,
                index === 4,
              ),
            ),
          },
          {
            workoutSets: ids.bench.map((id) =>
              set(id, options.benchReps ?? 10, 40, 10),
            ),
          },
          {
            workoutSets: ids.pulldown.map((id, index) =>
              set(id, 15, 30, 15, index === 2),
            ),
          },
        ],
      };
    };

    it('ignores workouts that are not program days or already processed', async () => {
      workoutFindFirst.mockResolvedValue({
        id: 500,
        programDayLog: null,
        workoutExercises: [],
      });
      await expect(service.onWorkoutCompleted(userId, 500)).resolves.toBeNull();
      workoutFindFirst.mockResolvedValue({
        id: 500,
        programDayLog: { status: 'COMPLETED' },
        workoutExercises: [],
      });
      await expect(service.onWorkoutCompleted(userId, 500)).resolves.toBeNull();
      expect(transaction).not.toHaveBeenCalled();
    });

    it('applies progression, marks the day done and advances the pointer', async () => {
      workoutFindFirst.mockResolvedValue(completedWorkout({ benchReps: 8 }));
      enrollmentFindUnique.mockResolvedValue(enrollment());

      const summary = await service.onWorkoutCompleted(userId, 500);

      expect(summary).toMatchObject({
        enrollmentId,
        position: { cycle: 1, weekIndex: 1, dayIndex: 1 },
        nextPosition: { cycle: 1, weekIndex: 1, dayIndex: 2 },
        nextDayName: 'B1',
        programCompleted: false,
      });
      expect(
        summary!.events.map((event) => [event.progressionKey, event.kind]),
      ).toEqual([
        ['t1-squat', 'INCREMENT'],
        ['t2-bench', 'STAGE_ADVANCE'],
        ['t3-lat-pulldown', 'HOLD'],
      ]);
      expect(stateUpsertMock).toHaveBeenCalledTimes(2);
      expect(stateUpsertMock).toHaveBeenCalledWith(
        containing({
          update: containing({ workingWeight: 65 }),
        }),
      );
      expect(logUpdate).toHaveBeenCalledWith(
        containing({
          where: { id: 99 },
          data: containing({ status: 'COMPLETED' }),
        }),
      );
      expect(enrollmentUpdate).toHaveBeenCalledWith({
        where: { id: enrollmentId },
        data: { currentCycle: 1, currentWeekIndex: 1, currentDayIndex: 2 },
      });
    });

    it('does not move the pointer when an earlier day is completed late', async () => {
      workoutFindFirst.mockResolvedValue(completedWorkout());
      enrollmentFindUnique.mockResolvedValue(
        enrollment({ currentDayIndex: 3 }),
      );

      const summary = await service.onWorkoutCompleted(userId, 500);

      expect(summary!.nextPosition).toBeNull();
      expect(enrollmentUpdate).not.toHaveBeenCalled();
    });

    it('rolls an open-ended program into the next cycle', async () => {
      const ids = programSetIds();
      workoutFindFirst.mockResolvedValue({
        id: 500,
        userId,
        programDayLog: {
          id: 99,
          enrollmentId,
          cycle: 1,
          weekIndex: 1,
          dayIndex: 4,
          status: 'STARTED',
        },
        workoutExercises: [],
      });
      void ids;
      enrollmentFindUnique.mockResolvedValue(
        enrollment({ currentDayIndex: 4 }),
      );

      const summary = await service.onWorkoutCompleted(userId, 500);

      expect(summary).toMatchObject({
        nextPosition: { cycle: 2, weekIndex: 1, dayIndex: 1 },
        programCompleted: false,
      });
      expect(enrollmentUpdate).toHaveBeenCalledWith({
        where: { id: enrollmentId },
        data: { currentCycle: 2, currentWeekIndex: 1, currentDayIndex: 1 },
      });
    });

    it('completes a fixed-length program after its last day', async () => {
      workoutFindFirst.mockResolvedValue({
        id: 500,
        userId,
        programDayLog: {
          id: 99,
          enrollmentId,
          cycle: 1,
          weekIndex: 1,
          dayIndex: 4,
          status: 'STARTED',
        },
        workoutExercises: [],
      });
      enrollmentFindUnique.mockResolvedValue(
        enrollment({
          currentDayIndex: 4,
          snapshot: { ...snapshot, durationMode: 'FIXED' },
        }),
      );

      const summary = await service.onWorkoutCompleted(userId, 500);

      expect(summary).toMatchObject({
        nextPosition: null,
        programCompleted: true,
      });
      expect(enrollmentUpdate).toHaveBeenCalledWith({
        where: { id: enrollmentId },
        data: { status: 'COMPLETED', completedAt: expect.any(Date) as Date },
      });
    });
  });

  describe('onWorkoutDeleted', () => {
    it('removes a started log but keeps completed ones', async () => {
      logFindFirst.mockResolvedValue({ id: 5, status: 'STARTED' });
      await service.onWorkoutDeleted(userId, 500);
      expect(logDelete).toHaveBeenCalledWith({ where: { id: 5 } });

      logDelete.mockClear();
      logFindFirst.mockResolvedValue({ id: 6, status: 'COMPLETED' });
      await service.onWorkoutDeleted(userId, 501);
      expect(logDelete).not.toHaveBeenCalled();
    });
  });

  describe('helpers', () => {
    it('maps rows to engine state and back to upserts', () => {
      const map = toStateMap(stateRows());
      expect(map.get('t1-squat')).toMatchObject({
        workingWeight: 60,
        exerciseId: 1,
        repsOffset: 0,
      });
      const upsert = stateUpsert(enrollmentId, map.get('t1-squat')!);
      expect(upsert.where).toEqual({
        enrollmentId_progressionKey: {
          enrollmentId,
          progressionKey: 't1-squat',
        },
      });
      expect(upsert.create).toMatchObject({
        enrollmentId,
        progressionKey: 't1-squat',
        originalExerciseId: 1,
        workingWeight: 60,
      });
    });
  });
});
