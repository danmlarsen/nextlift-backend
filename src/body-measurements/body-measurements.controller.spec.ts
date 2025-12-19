import { Test, TestingModule } from '@nestjs/testing';
import { BodyMeasurementsController } from './body-measurements.controller';

describe('BodyMeasurementsController', () => {
  let controller: BodyMeasurementsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BodyMeasurementsController],
    }).compile();

    controller = module.get<BodyMeasurementsController>(BodyMeasurementsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
