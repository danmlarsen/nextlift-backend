import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateMeasurementDto } from './dtos/create-measurement.dto';

@Injectable()
export class BodyMeasurementsService {
  constructor(private readonly prismaService: PrismaService) {}

  findMeasurements(userId: number) {
    return this.prismaService.bodyMeasurement.findMany({
      where: { userId },
    });
  }

  createMeasurement(userId: number, data: CreateMeasurementDto) {
    if (!data.measuredAt) {
      data.measuredAt = new Date().toISOString();
    }

    return this.prismaService.bodyMeasurement.create({
      data: { ...data, userId },
    });
  }
}
