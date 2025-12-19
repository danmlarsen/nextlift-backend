import { Test, TestingModule } from '@nestjs/testing';
import { BodyMeasurementsService } from './body-measurements.service';

describe('BodyMeasurementsService', () => {
  let service: BodyMeasurementsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BodyMeasurementsService],
    }).compile();

    service = module.get<BodyMeasurementsService>(BodyMeasurementsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
