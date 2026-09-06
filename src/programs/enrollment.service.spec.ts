import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  gzclpDayA1,
  makeBlock,
  makeDay,
  makeProgram,
  makeState,
  resetFixtureIds,
} from './engine/testing/fixtures';
import { EnrollmentWorkoutService } from './enrollment-workout.service';
import { EnrollmentService } from './enrollment.service';
import { ProgramSnapshot } from './engine/types';

/** Typed asymmetric matcher so nested matchers are not `any` for the linter. */
const containing = (value: Record<string, unknown>): object =>
  expect.objectContaining(value) as object;

type EnrollmentCreateArgs = {
  data: {
    snapshot: ProgramSnapshot;
    states: { create: { workingWeight: number | null }[] };
  };
};

describe('EnrollmentService', () => {
  let service: EnrollmentService;

  const programFindFirst = jest.fn();
  const enrollmentFindFirst = jest.fn();
  const enrollmentFindMany = jest.fn();
  const enrollmentFindUniqueOrThrow = jest.fn();
  const enrollmentCount = jest.fn();
  const enrollmentCreate = jest.fn();
  const enrollmentUpdate = jest.fn();
  const enrollmentDelete = jest.fn();
  const recordFindMany = jest.fn();
  const exerciseFindMany = jest.fn();
  const exerciseFindFirst = jest.fn();
  const stateUpdateMany = jest.fn();
  const logUpsert = jest.fn();
  const queryRaw = jest.fn();
  const transaction = jest.fn();
  const onWorkoutCompleted = jest.fn();

  const prismaMock = {
    program: { findFirst: programFindFirst },
    programEnrollment: {
      findFirst: enrollmentFindFirst,
      findMany: enrollmentFindMany,
      findUniqueOrThrow: enrollmentFindUniqueOrThrow,
      count: enrollmentCount,
      create: enrollmentCreate,
      update: enrollmentUpdate,
      delete: enrollmentDelete,
    },
    personalRecord: { findMany: recordFindMany },
    exercise: { findMany: exerciseFindMany, findFirst: exerciseFindFirst },
    programEnrollmentExerciseState: { updateMany: stateUpdateMany },
    programEnrollmentDayLog: { upsert: logUpsert },
    $queryRaw: queryRaw,
    $transaction: transaction,
  };

  const userId = 7;
  const program = () => {
    const snapshot = makeProgram(
      [makeBlock({ weekCount: 1, days: [gzclpDayA1()] })],
      { durationMode: 'OPEN_ENDED' },
    );
    return {
      ...snapshot,
      userId: -1,
      visibility: 'SYSTEM',
      slug: 'tiered',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    resetFixtureIds();
    programFindFirst.mockResolvedValue(program());
    queryRaw.mockResolvedValue([]);
    recordFindMany.mockResolvedValue([]);
    exerciseFindMany.mockResolvedValue([]);
    enrollmentFindFirst.mockResolvedValue(null);
    enrollmentCount.mockResolvedValue(0);
    enrollmentCreate.mockImplementation((args: { data: unknown }) =>
      Promise.resolve({
        id: 11,
        ...(args.data as object),
        states: [],
        dayLogs: [],
      }),
    );
    transaction.mockImplementation(async (arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => Promise<unknown>)(prismaMock)
        : Promise.all(arg as Promise<unknown>[]),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnrollmentService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EnrollmentWorkoutService, useValue: { onWorkoutCompleted } },
        {
          provide: 'PinoLogger:EnrollmentService',
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    }).compile();
    service = module.get(EnrollmentService);
  });

  describe('getEnrollDefaults', () => {
    it('suggests working weights from history and reports validation problems', async () => {
      queryRaw.mockResolvedValue([{ exerciseId: 1, weight: 62.5 }]);
      recordFindMany.mockResolvedValue([{ exerciseId: 2, value: 80 }]);

      const result = await service.getEnrollDefaults(userId, 1);

      expect(result.problems).toEqual([]);
      expect(result.defaults).toEqual([
        containing({
          progressionKey: 't1-squat',
          field: 'workingWeight',
          suggested: 62.5,
          source: 'LAST_WORKOUT',
        }),
        containing({
          progressionKey: 't2-bench',
          suggested: null,
        }),
        containing({
          progressionKey: 't3-lat-pulldown',
          suggested: null,
        }),
      ]);
    });

    it('refuses programs the user cannot read', async () => {
      programFindFirst.mockResolvedValue(null);
      await expect(service.getEnrollDefaults(userId, 1)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('enroll', () => {
    const dto = { programId: 1, startDate: '2026-09-07' };

    it('rejects programs that fail validation', async () => {
      programFindFirst.mockResolvedValue({
        ...program(),
        blocks: [
          { ...program().blocks[0], days: [makeDay({ exercises: [] })] },
        ],
      });
      await expect(service.enroll(userId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects unknown progression keys and unavailable swaps', async () => {
      await expect(
        service.enroll(userId, {
          ...dto,
          states: [{ progressionKey: 'nope' }],
        }),
      ).rejects.toThrow(BadRequestException);
      exerciseFindMany.mockResolvedValue([]);
      await expect(
        service.enroll(userId, {
          ...dto,
          states: [{ progressionKey: 't1-squat', exerciseId: 999 }],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuses a second active enrollment', async () => {
      enrollmentFindFirst.mockResolvedValue({ id: 3 });
      await expect(service.enroll(userId, dto)).rejects.toThrow(
        ConflictException,
      );
      expect(enrollmentCreate).not.toHaveBeenCalled();
    });

    it('creates the snapshot and one state per key, filling gaps from history', async () => {
      queryRaw.mockResolvedValue([{ exerciseId: 1, weight: 62.5 }]);

      await service.enroll(userId, {
        ...dto,
        startWeightsMode: 'HISTORY',
        states: [
          { progressionKey: 't2-bench', workingWeight: 45, roundingKg: 1.25 },
        ],
      });

      const { data } = (
        enrollmentCreate.mock.calls[0] as [EnrollmentCreateArgs]
      )[0];
      expect(data).toMatchObject({
        userId,
        programId: 1,
        programVersion: 1,
        programName: 'Test program',
        totalWeeks: 1,
        startDate: new Date('2026-09-07T00:00:00.000Z'),
      });
      expect(data.snapshot.blocks[0].days[0].exercises).toHaveLength(3);
      expect(data.states.create).toEqual([
        containing({
          progressionKey: 't1-squat',
          exerciseId: 1,
          workingWeight: 62.5,
        }),
        containing({
          progressionKey: 't2-bench',
          exerciseId: 2,
          workingWeight: 45,
          roundingKg: 1.25,
        }),
        containing({
          progressionKey: 't3-lat-pulldown',
          exerciseId: 3,
          workingWeight: null,
        }),
      ]);
    });

    it('leaves loads empty in EMPTY mode', async () => {
      queryRaw.mockResolvedValue([{ exerciseId: 1, weight: 62.5 }]);
      await service.enroll(userId, { ...dto, startWeightsMode: 'EMPTY' });
      expect(queryRaw).not.toHaveBeenCalled();
      expect(
        (enrollmentCreate.mock.calls[0] as [EnrollmentCreateArgs])[0].data
          .states.create[0].workingWeight,
      ).toBeNull();
    });
  });

  describe('getActiveEnrollment', () => {
    it('returns null without an active enrollment', async () => {
      await expect(
        service.getActiveEnrollment(userId, '2026-09-07'),
      ).resolves.toBeNull();
    });

    it('rejects malformed dates', async () => {
      await expect(
        service.getActiveEnrollment(userId, 'yesterday'),
      ).rejects.toThrow(BadRequestException);
    });

    it('builds the schedule view with states and exercises', async () => {
      const snapshot = program();
      enrollmentFindFirst.mockResolvedValue({
        id: 11,
        userId,
        status: 'ACTIVE',
        snapshot,
        startDate: new Date('2026-09-07T00:00:00.000Z'),
        weekdayMap: null,
        currentCycle: 1,
        currentWeekIndex: 1,
        currentDayIndex: 1,
        states: [
          {
            ...makeState({
              progressionKey: 't1-squat',
              exerciseId: 1,
              workingWeight: 60,
            }),
            id: 1,
          },
        ],
        dayLogs: [],
      });
      exerciseFindMany.mockResolvedValue([
        {
          id: 1,
          name: 'Barbell Squat',
          equipment: 'barbell',
          category: 'strength',
        },
      ]);

      const view = await service.getActiveEnrollment(userId, '2026-09-08');

      expect(view).toMatchObject({
        id: 11,
        schedule: {
          mode: 'SEQUENCE',
          position: { cycle: 1, weekIndex: 1, dayIndex: 1 },
        },
      });
      expect(view!.states[0].exercise).toMatchObject({ name: 'Barbell Squat' });
      expect(view!.schedule.next).toMatchObject({ dayName: 'A1' });
      expect(view!.schedule.next!.exercises[0].sets[0].weight).toBe(60);
    });
  });

  describe('skipDay / swapExercise / deleteEnrollment', () => {
    const active = () => ({
      id: 11,
      userId,
      status: 'ACTIVE',
      snapshot: program(),
      startDate: new Date('2026-09-07T00:00:00.000Z'),
      weekdayMap: null,
      currentCycle: 1,
      currentWeekIndex: 1,
      currentDayIndex: 1,
      states: [
        { ...makeState({ progressionKey: 't1-squat', exerciseId: 1 }), id: 1 },
      ],
      dayLogs: [],
    });

    it('logs a skipped day and moves the pointer on', async () => {
      enrollmentFindFirst.mockResolvedValue(active());
      exerciseFindMany.mockResolvedValue([]);

      await service.skipDay(
        userId,
        11,
        { weekIndex: 1, dayIndex: 1 },
        '2026-09-08',
      );

      expect(logUpsert).toHaveBeenCalledWith(
        containing({
          create: containing({
            enrollmentId: 11,
            dayIndex: 1,
            status: 'SKIPPED',
            dayName: 'A1',
          }),
        }),
      );
      // Single-day, open-ended: the next position is cycle 2.
      expect(enrollmentUpdate).toHaveBeenCalledWith({
        where: { id: 11 },
        data: { currentCycle: 2, currentWeekIndex: 1, currentDayIndex: 1 },
      });
    });

    it('swaps every slot using the exercise and validates the target', async () => {
      enrollmentFindFirst.mockResolvedValue(active());
      exerciseFindFirst.mockResolvedValue(null);
      await expect(
        service.swapExercise(userId, 11, {
          fromExerciseId: 1,
          toExerciseId: 5,
        }),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.swapExercise(userId, 11, {
          fromExerciseId: 42,
          toExerciseId: 5,
        }),
      ).rejects.toThrow(BadRequestException);

      exerciseFindFirst.mockResolvedValue({ id: 5 });
      exerciseFindMany.mockResolvedValue([]);
      await service.swapExercise(userId, 11, {
        fromExerciseId: 1,
        toExerciseId: 5,
      });
      expect(stateUpdateMany).toHaveBeenCalledWith({
        where: { enrollmentId: 11, exerciseId: 1 },
        data: { exerciseId: 5 },
      });
    });

    it('refuses to delete an active enrollment', async () => {
      enrollmentFindFirst.mockResolvedValue(active());
      await expect(service.deleteEnrollment(userId, 11)).rejects.toThrow(
        BadRequestException,
      );
      enrollmentFindFirst.mockResolvedValue({
        ...active(),
        status: 'ABANDONED',
      });
      enrollmentDelete.mockResolvedValue({ id: 11 });
      await expect(service.deleteEnrollment(userId, 11)).resolves.toEqual({
        id: 11,
      });
    });
  });
});
