import { Test, TestingModule } from '@nestjs/testing';
import { DemoService } from './demo.service';
import { AuthService } from './auth.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { PersonalRecordsService } from 'src/personal-records/personal-records.service';

describe('DemoService', () => {
  let service: DemoService;
  const userFindMany = jest.fn();
  const transaction = jest.fn();
  const loggerError = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    userFindMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DemoService,
        {
          provide: PrismaService,
          useValue: {
            user: { findMany: userFindMany },
            $transaction: transaction,
          },
        },
        { provide: AuthService, useValue: {} },
        { provide: ConfigService, useValue: {} },
        { provide: PersonalRecordsService, useValue: {} },
        {
          provide: 'PinoLogger:DemoService',
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

    service = module.get<DemoService>(DemoService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('does not let a cleanup failure block callers', async () => {
    const cleanupError = new Error('database unavailable');
    userFindMany.mockRejectedValue(cleanupError);

    await expect(service.cleanupExpiredDemoUsers()).resolves.toBeUndefined();

    expect(loggerError).toHaveBeenCalledWith(
      'Failed to clean up expired demo users',
      { error: cleanupError },
    );
  });
});
