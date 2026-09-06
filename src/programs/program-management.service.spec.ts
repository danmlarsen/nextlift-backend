import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { PROGRAM_LIST_LIMIT } from 'src/common/constants';
import { ProgramManagementService } from './program-management.service';

/** Typed asymmetric matcher so nested matchers are not `any` for the linter. */
const containing = (value: Record<string, unknown>): object =>
  expect.objectContaining(value) as object;

type ProgramCreateArgs = {
  data: {
    blocks: {
      create: { days: { create: { exercises: { create: unknown[] } }[] } }[];
    };
  };
};

describe('ProgramManagementService', () => {
  let service: ProgramManagementService;

  const programCount = jest.fn();
  const programFindFirst = jest.fn();
  const programFindMany = jest.fn();
  const programCreate = jest.fn();
  const programUpdate = jest.fn();
  const programDelete = jest.fn();

  const prismaMock = {
    program: {
      count: programCount,
      findFirst: programFindFirst,
      findMany: programFindMany,
      create: programCreate,
      update: programUpdate,
      delete: programDelete,
    },
  };

  const userId = 7;
  const summaryRow = (id: number, overrides: Record<string, unknown> = {}) => ({
    id,
    userId: -1,
    visibility: 'SYSTEM',
    name: `Program ${id}`,
    blocks: [{ _count: { weeks: 3 } }, { _count: { weeks: 1 } }],
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProgramManagementService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: 'PinoLogger:ProgramManagementService',
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    }).compile();
    service = module.get(ProgramManagementService);
  });

  describe('listPrograms', () => {
    it('lists curated programs with week totals and ownership flags', async () => {
      programFindMany.mockResolvedValue([
        summaryRow(1),
        summaryRow(2, { userId, visibility: 'PRIVATE' }),
      ]);

      const result = await service.listPrograms(userId, {
        scope: 'system',
        level: 'BEGINNER',
      });

      expect(programFindMany).toHaveBeenCalledWith(
        containing({
          where: { visibility: 'SYSTEM', level: 'BEGINNER' },
          take: PROGRAM_LIST_LIMIT + 1,
          orderBy: [{ level: 'asc' }, { id: 'asc' }],
        }),
      );
      expect(result.meta).toEqual({ hasNextPage: false, nextCursor: null });
      expect(result.data[0]).toMatchObject({
        id: 1,
        totalWeeks: 4,
        isOwner: false,
        isSystem: true,
      });
      expect(result.data[0]).not.toHaveProperty('blocks');
      expect(result.data[1]).toMatchObject({ isOwner: true, isSystem: false });
    });

    it('paginates by id cursor and scopes to the user for "mine"', async () => {
      programFindMany.mockResolvedValue(
        Array.from({ length: PROGRAM_LIST_LIMIT + 1 }, (_, index) =>
          summaryRow(100 - index),
        ),
      );

      const result = await service.listPrograms(userId, {
        scope: 'mine',
        cursor: 200,
      });

      expect(programFindMany).toHaveBeenCalledWith(
        containing({
          where: { userId },
          cursor: { id: 200 },
          skip: 1,
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        }),
      );
      expect(result.data).toHaveLength(PROGRAM_LIST_LIMIT);
      expect(result.meta).toEqual({
        hasNextPage: true,
        nextCursor: 100 - PROGRAM_LIST_LIMIT + 1,
      });
    });
  });

  describe('getProgram', () => {
    it('reads own and curated programs only', async () => {
      programFindFirst.mockResolvedValue(null);
      await expect(service.getProgram(userId, 5)).rejects.toThrow(
        ForbiddenException,
      );
      expect(programFindFirst).toHaveBeenCalledWith(
        containing({
          where: { id: 5, OR: [{ userId }, { visibility: 'SYSTEM' }] },
        }),
      );
    });

    it('flags ownership on the returned tree', async () => {
      programFindFirst.mockResolvedValue({
        id: 5,
        userId,
        visibility: 'PRIVATE',
        blocks: [],
      });
      await expect(service.getProgram(userId, 5)).resolves.toMatchObject({
        isOwner: true,
        isSystem: false,
      });
    });
  });

  describe('createProgram', () => {
    const dto = {
      name: 'My plan',
      goal: 'STRENGTH' as const,
      level: 'NOVICE' as const,
      daysPerWeek: 3,
    };

    it('enforces the per-user cap', async () => {
      programCount.mockResolvedValue(20);
      await expect(service.createProgram(userId, dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(programCreate).not.toHaveBeenCalled();
    });

    it('creates the program with a starter block and week', async () => {
      programCount.mockResolvedValue(0);
      programCreate.mockResolvedValue({
        id: 9,
        userId,
        visibility: 'PRIVATE',
        blocks: [],
      });

      await service.createProgram(userId, dto);

      expect(programCreate).toHaveBeenCalledWith(
        containing({
          data: containing({
            ...dto,
            userId,
            blocks: {
              create: [
                {
                  blockOrder: 1,
                  name: 'Block 1',
                  weeks: { create: [{ weekInBlock: 1 }] },
                },
              ],
            },
          }),
        }),
      );
    });
  });

  describe('updateProgram / deleteProgram', () => {
    it('refuses programs the user does not own (or curated ones)', async () => {
      programFindFirst.mockResolvedValue(null);
      await expect(
        service.updateProgram(userId, 3, { name: 'x' }),
      ).rejects.toThrow(ForbiddenException);
      await expect(service.deleteProgram(userId, 3)).rejects.toThrow(
        ForbiddenException,
      );
      expect(programFindFirst).toHaveBeenCalledWith({
        where: { id: 3, userId, visibility: 'PRIVATE' },
      });
      expect(programUpdate).not.toHaveBeenCalled();
      expect(programDelete).not.toHaveBeenCalled();
    });

    it('updates and deletes owned programs', async () => {
      programFindFirst.mockResolvedValue({
        id: 3,
        userId,
        visibility: 'PRIVATE',
      });
      programUpdate.mockResolvedValue({
        id: 3,
        userId,
        visibility: 'PRIVATE',
        blocks: [],
      });
      programDelete.mockResolvedValue({ id: 3 });

      await expect(
        service.updateProgram(userId, 3, { name: 'Renamed' }),
      ).resolves.toMatchObject({ isOwner: true });
      expect(programUpdate).toHaveBeenCalledWith(
        containing({
          where: { id: 3 },
          data: { name: 'Renamed' },
        }),
      );
      await expect(service.deleteProgram(userId, 3)).resolves.toEqual({
        id: 3,
      });
    });
  });

  describe('duplicateProgram', () => {
    it('copies a curated program into a private one with its whole tree', async () => {
      programFindFirst.mockResolvedValue({
        id: 1,
        userId: -1,
        visibility: 'SYSTEM',
        name: 'Tiered Linear Progression',
        description: 'd',
        credit: 'c',
        goal: 'STRENGTH',
        level: 'BEGINNER',
        scheduleMode: 'SEQUENCE',
        durationMode: 'OPEN_ENDED',
        daysPerWeek: 3,
        effortScale: 'RPE',
        blocks: [
          {
            id: 10,
            blockOrder: 1,
            name: 'Rotation',
            focus: null,
            weeks: [
              {
                weekInBlock: 1,
                label: null,
                isDeload: false,
                volumeMultiplier: 1,
                intensityMultiplier: 1,
              },
            ],
            days: [
              {
                id: 20,
                dayOrder: 1,
                name: 'A1',
                weekday: null,
                notes: null,
                exercises: [
                  {
                    exerciseId: 1,
                    exerciseOrder: 1,
                    progressionKey: 't1-squat',
                    strategy: 'LINEAR',
                    progression: { strategy: 'LINEAR', incrementKg: 5 },
                    roundingKg: null,
                    restSeconds: 180,
                    notes: null,
                    sets: [
                      {
                        weekInBlock: null,
                        setOrder: 1,
                        type: 'normal',
                        repsMin: 3,
                        repsMax: 3,
                        isAmrap: true,
                        percent: null,
                        weight: null,
                        targetRpe: null,
                        restSeconds: null,
                        duration: null,
                        notes: null,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });
      programCount.mockResolvedValue(1);
      programCreate.mockResolvedValue({
        id: 2,
        userId,
        visibility: 'PRIVATE',
        blocks: [],
      });

      const copy = await service.duplicateProgram(userId, 1);

      expect(copy).toMatchObject({ isOwner: true });
      const { data } = (programCreate.mock.calls[0] as [ProgramCreateArgs])[0];
      expect(data).toMatchObject({
        userId,
        name: 'Copy of Tiered Linear Progression',
        visibility: 'PRIVATE',
        credit: 'c',
      });
      expect(
        data.blocks.create[0].days.create[0].exercises.create[0],
      ).toMatchObject({
        exerciseId: 1,
        progressionKey: 't1-squat',
        progression: { strategy: 'LINEAR', incrementKg: 5 },
        sets: {
          create: [containing({ repsMin: 3, isAmrap: true })],
        },
      });
    });
  });
});
