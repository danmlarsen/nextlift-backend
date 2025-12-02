import { Module } from '@nestjs/common';
import { BodyMeasurementsController } from './body-measurements.controller';
import { BodyMeasurementsService } from './body-measurements.service';

@Module({
  controllers: [BodyMeasurementsController],
  providers: [BodyMeasurementsService]
})
export class BodyMeasurementsModule {}
