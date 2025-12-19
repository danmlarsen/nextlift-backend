import { Module } from '@nestjs/common';
import { BodyMeasurementsController } from './body-measurements.controller';
import { BodyMeasurementsService } from './body-measurements.service';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BodyMeasurementsController],
  providers: [BodyMeasurementsService],
})
export class BodyMeasurementsModule {}
