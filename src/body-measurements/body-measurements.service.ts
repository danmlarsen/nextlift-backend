import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateMeasurementDto } from './dtos/create-measurement.dto';
import { UpdateMeasurementDto } from './dtos/update-measurement.dto';

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

  updateMeasurement(
    userId: number,
    measurementId: number,
    data: UpdateMeasurementDto,
  ) {
    return this.prismaService.bodyMeasurement.update({
      where: {
        id: measurementId,
        userId,
      },
      data,
    });
  }

  deleteMeasurement(userId: number, measurementId: number) {
    return this.prismaService.bodyMeasurement.delete({
      where: {
        id: measurementId,
        userId,
      },
    });
  }
}
