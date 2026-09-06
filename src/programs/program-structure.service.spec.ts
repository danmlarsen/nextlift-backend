import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { PutDayContentDto } from './dtos/day-content.dto';
import {
  defaultProgressionKey,
  ProgramStructureService,
} from './program-structure.service';

/** Typed asymmetric matcher so nested matchers are not `any` for the linter. */
const containing = (value: Record<string, unknown>): object =>
  expect.objectContaining(value) as object;

type DayUpdateArgs = {
  where: { id: number };
  data: { exercises: { create: { sets: { create: unknown[] } }[] } };
};

describe('ProgramStructureService', () => {
  let service: ProgramStructureService;

  const programFindFirst = jest.fn();
  const programFindUniqueOrThrow = jest.fn();
  const blockCount = jest.fn();
  const blockCreate = jest.fn();
  const blockFindFirst = jest.fn();
  const dayFindFirst = jest.fn();
  const dayCount = jest.fn();
  const dayCreate = jest.fn();
  const dayUpdate = jest.fn();
  const exerciseFindMany = jest.fn();
  const programExerciseFindMany = jest.fn();
  const programExerciseDeleteMany = jest.fn();
  const programExerciseCount = jest.fn();
  const templateFindFirst = jest.fn();
  const transaction = jest.fn();

  const prismaMock = {
    program: {
      findFirst: programFindFirst,
      findUniqueOrThrow: programFindUniqueOrThrow,
    },
    programBlock: {
      count: blockCount,
      create: blockCreate,
      findFirst: blockFindFirst,
    },
    programDay: {
      findFirst: dayFindFirst,
      count: dayCount,
      create: dayCreate,
      update: dayUpdate,
    },
    exercise: { findMany: exerciseFindMany },
    programExercise: {
      findMany: programExerciseFindMany,
      deleteMany: programExerciseDeleteMany,
      count: programExerciseCount,
    },
    workoutTemplate: { findFirst: templateFindFirst },
    $transaction: transaction,
  };

  const userId = 7;
  const programId = 3;
  const dayId = 30;

  beforeEach(async () => {
    jest.clearAllMocks();
    programFindFirst.mockResolvedValue({
      id: programId,
      userId,
      visibility: 'PRIVATE',
    });
    programFindUniqueOrThrow.mockResolvedValue({
      id: programId,
      userId,
      visibility: 'PRIVATE',
      blocks: [],
    });
    dayFindFirst.mockResolvedValue({ id: dayId, blockId: 10, dayOrder: 1 });
    programExerciseFindMany.mockResolvedValue([]);
    // Interactive transactions run against the same mock.
    transaction.mockImplementation(async (arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => Promise<unknown>)(prismaMock)
        : Promise.all(arg as Promise<unknown>[]),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProgramStructureService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: 'PinoLogger:ProgramStructureService',
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    }).compile();
    service = module.get(ProgramStructureService);
  });

  describe('putDayContent', () => {
    const content = (
      overrides: Partial<PutDayContentDto['exercises'][number]> = {},
    ): PutDayContentDto => ({
      exercises: [
        {
          exerciseId: 1,
          strategy: 'LINEAR',
          progression: { strategy: 'LINEAR', incrementKg: 2.5 },
          sets: [
            { repsMin: 5, repsMax: 5 },
            { repsMin: 5, repsMax: 5 },
            { weekInBlock: 2, repsMin: 3 },
          ],
          ...overrides,
        },
      ],
    });

    it('refuses days outside programs the user owns', async () => {
      programFindFirst.mockResolvedValue(null);
      await expect(
        service.putDayContent(userId, programId, dayId, content()),
      ).rejects.toThrow(ForbiddenException);
    });

    it('requires every exercise to be available to the user', async () => {
      exerciseFindMany.mockResolvedValue([]);
      await expect(
        service.putDayContent(userId, programId, dayId, content()),
      ).rejects.toThrow(NotFoundException);
      expect(exerciseFindMany).toHaveBeenCalledWith({
        where: { id: { in: [1] }, OR: [{ userId }, { userId: -1 }] },
        select: { id: true },
      });
    });

    it('rejects progression settings that do not match the strategy', async () => {
      exerciseFindMany.mockResolvedValue([{ id: 1 }]);
      await expect(
        service.putDayContent(
          userId,
          programId,
          dayId,
          content({ progression: { strategy: 'DOUBLE', incrementKg: 2.5 } }),
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.putDayContent(
          userId,
          programId,
          dayId,
          content({ progression: null }),
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.putDayContent(
          userId,
          programId,
          dayId,
          content({ sets: [{ repsMin: 12, repsMax: 8 }] }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a key already bound to another exercise in the program', async () => {
      exerciseFindMany.mockResolvedValue([{ id: 1 }]);
      programExerciseFindMany.mockResolvedValue([
        { progressionKey: 'ex-1', exerciseId: 2, strategy: 'LINEAR' },
      ]);
      await expect(
        service.putDayContent(userId, programId, dayId, content()),
      ).rejects.toThrow(BadRequestException);
    });

    it('replaces the day content in one transaction with normalized sets', async () => {
      exerciseFindMany.mockResolvedValue([{ id: 1 }]);

      await service.putDayContent(
        userId,
        programId,
        dayId,
        content({ restSeconds: 120 }),
      );

      expect(programExerciseDeleteMany).toHaveBeenCalledWith({
        where: { dayId },
      });
      const update = (dayUpdate.mock.calls[0] as [DayUpdateArgs])[0];
      expect(update.where).toEqual({ id: dayId });
      const created = update.data.exercises.create[0];
      expect(created).toMatchObject({
        exercise: { connect: { id: 1 } },
        exerciseOrder: 1,
        progressionKey: defaultProgressionKey(1),
        strategy: 'LINEAR',
        progression: { strategy: 'LINEAR', incrementKg: 2.5 },
        restSeconds: 120,
      });
      expect(created.sets.create).toEqual([
        containing({
          weekInBlock: null,
          setOrder: 1,
          repsMin: 5,
          repsMax: 5,
          type: 'normal',
        }),
        containing({ weekInBlock: null, setOrder: 2 }),
        containing({
          weekInBlock: 2,
          setOrder: 1,
          repsMin: 3,
          repsMax: 3,
        }),
      ]);
      expect(programFindUniqueOrThrow).toHaveBeenCalled();
    });
  });

  describe('blocks and days', () => {
    it('enforces the block cap and creates default weeks', async () => {
      blockCount.mockResolvedValue(12);
      await expect(
        service.createBlock(userId, programId, { name: 'Peak' }),
      ).rejects.toThrow(BadRequestException);

      blockCount.mockResolvedValue(1);
      await service.createBlock(userId, programId, { name: 'Peak', weeks: 3 });
      expect(blockCreate).toHaveBeenCalledWith({
        data: {
          programId,
          blockOrder: 2,
          name: 'Peak',
          focus: null,
          weeks: {
            create: [
              { weekInBlock: 1 },
              { weekInBlock: 2 },
              { weekInBlock: 3 },
            ],
          },
        },
      });
    });

    it('enforces the day cap inside a block', async () => {
      blockFindFirst.mockResolvedValue({ id: 10, programId });
      dayCount.mockResolvedValue(14);
      await expect(
        service.createDay(userId, programId, 10, { name: 'Extra' }),
      ).rejects.toThrow(BadRequestException);
      expect(dayCreate).not.toHaveBeenCalled();
    });
  });

  describe('importDayFromTemplate', () => {
    it('refuses templates the user does not own', async () => {
      templateFindFirst.mockResolvedValue(null);
      await expect(
        service.importDayFromTemplate(userId, programId, dayId, {
          templateId: 4,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('appends template exercises as fixed prescriptions', async () => {
      templateFindFirst.mockResolvedValue({
        id: 4,
        userId,
        workoutTemplateExercises: [
          {
            exerciseId: 8,
            notes: 'slow',
            workoutTemplateSets: [
              {
                type: 'warmup',
                reps: 10,
                weight: 40,
                duration: null,
                notes: null,
              },
              {
                type: 'normal',
                reps: 5,
                weight: 100,
                duration: null,
                notes: 'belt',
              },
            ],
          },
        ],
      });
      programExerciseCount.mockResolvedValue(2);

      await service.importDayFromTemplate(userId, programId, dayId, {
        templateId: 4,
      });

      const created = (dayUpdate.mock.calls[0] as [DayUpdateArgs])[0].data
        .exercises.create[0];
      expect(created).toMatchObject({
        exercise: { connect: { id: 8 } },
        exerciseOrder: 3,
        progressionKey: 'ex-8',
        strategy: 'NONE',
        progression: { strategy: 'NONE', basis: 'FIXED' },
        notes: 'slow',
      });
      expect(created.sets.create).toEqual([
        {
          setOrder: 1,
          type: 'warmup',
          repsMin: 10,
          repsMax: 10,
          weight: 40,
          duration: null,
          notes: null,
        },
        {
          setOrder: 2,
          type: 'normal',
          repsMin: 5,
          repsMax: 5,
          weight: 100,
          duration: null,
          notes: 'belt',
        },
      ]);
    });
  });

  describe('static helpers', () => {
    it('numbers sets per week scope', () => {
      expect(
        ProgramStructureService.normalizeSets([
          { repsMin: 5 },
          { weekInBlock: 1, percent: 65, repsMin: 5 },
          { weekInBlock: 1, percent: 75, repsMin: 5 },
          { repsMin: 5, repsMax: 8 },
        ]).map((set) => [set.weekInBlock, set.setOrder, set.repsMax]),
      ).toEqual([
        [null, 1, 5],
        [1, 1, 5],
        [1, 2, 5],
        [null, 2, 8],
      ]);
    });
  });
});
