import { Test, TestingModule } from '@nestjs/testing';
import { BodyMeasurementsService } from './body-measurements.service';
import { PrismaService } from 'src/prisma/prisma.service';

describe('BodyMeasurementsService', () => {
  let service: BodyMeasurementsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BodyMeasurementsService,
        { provide: PrismaService, useValue: {} },
        { provide: 'PinoLogger:BodyMeasurementsService', useValue: {} },
      ],
    }).compile();

    service = module.get<BodyMeasurementsService>(BodyMeasurementsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
