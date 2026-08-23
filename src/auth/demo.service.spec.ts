import { Test, TestingModule } from '@nestjs/testing';
import { DemoService } from './demo.service';
import { AuthService } from './auth.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { PersonalRecordsService } from 'src/personal-records/personal-records.service';

describe('DemoService', () => {
  let service: DemoService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DemoService,
        { provide: PrismaService, useValue: {} },
        { provide: AuthService, useValue: {} },
        { provide: ConfigService, useValue: {} },
        { provide: PersonalRecordsService, useValue: {} },
        {
          provide: 'PinoLogger:DemoService',
          useValue: {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
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
});
