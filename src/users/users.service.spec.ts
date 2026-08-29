import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { UserType } from '@prisma/client';
import { UNCONFIRMED_USER_MAX_AGE_DAYS } from 'src/common/constants';

describe('UsersService', () => {
  let service: UsersService;
  const userFindMany = jest.fn();
  const transaction = jest.fn();
  const loggerError = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    userFindMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: {
            user: { findMany: userFindMany },
            $transaction: transaction,
          },
        },
        {
          provide: 'PinoLogger:UsersService',
          useValue: {
            info: jest.fn(),
            warn: jest.fn(),
            error: loggerError,
            fatal: jest.fn(),
            debug: jest.fn(),
            trace: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('cleanupStaleUnconfirmedUsers()', () => {
    const expectedWhereClause = {
      userType: UserType.REGULAR,
      isEmailConfirmed: false,
      lastLoginAt: null,
      createdAt: { lt: expect.any(Date) as Date },
    };

    it('tombstones and deletes stale unconfirmed regular users', async () => {
      const staleUsers = [
        {
          id: 7,
          email: 'never@confirmed.com',
          createdAt: new Date('2026-01-01'),
        },
        {
          id: 9,
          email: 'also-never@confirmed.com',
          createdAt: new Date('2026-02-01'),
        },
      ];
      userFindMany.mockResolvedValue(staleUsers);

      const tombstoneCreateMany = jest.fn().mockResolvedValue({ count: 2 });
      const userDeleteMany = jest.fn().mockResolvedValue({ count: 2 });
      transaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          deletedUser: { createMany: tombstoneCreateMany },
          user: { deleteMany: userDeleteMany },
        }),
      );

      await service.cleanupStaleUnconfirmedUsers();

      expect(userFindMany).toHaveBeenCalledWith({
        where: expectedWhereClause,
      });

      // The cutoff must sit the retention window back from now.
      const findManyCall = userFindMany.mock.calls[0] as [
        { where: { createdAt: { lt: Date } } },
      ];
      const expectedCutoff =
        Date.now() - UNCONFIRMED_USER_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
      expect(
        Math.abs(findManyCall[0].where.createdAt.lt.getTime() - expectedCutoff),
      ).toBeLessThan(5000);

      expect(tombstoneCreateMany).toHaveBeenCalledWith({
        data: [
          {
            originalUserId: 7,
            email: 'never@confirmed.com',
            createdAt: staleUsers[0].createdAt,
          },
          {
            originalUserId: 9,
            email: 'also-never@confirmed.com',
            createdAt: staleUsers[1].createdAt,
          },
        ],
      });
      expect(userDeleteMany).toHaveBeenCalledWith({
        where: expectedWhereClause,
      });
    });

    it('does nothing when no stale unconfirmed users exist', async () => {
      userFindMany.mockResolvedValue([]);

      await service.cleanupStaleUnconfirmedUsers();

      expect(transaction).not.toHaveBeenCalled();
    });

    it('does not let a cleanup failure block callers', async () => {
      const cleanupError = new Error('database unavailable');
      userFindMany.mockRejectedValue(cleanupError);

      await expect(
        service.cleanupStaleUnconfirmedUsers(),
      ).resolves.toBeUndefined();

      expect(loggerError).toHaveBeenCalledWith(
        'Failed to clean up stale unconfirmed users',
        { error: cleanupError },
      );
    });
  });
});
