import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateMeasurementDto } from './dtos/create-measurement.dto';
import { UpdateMeasurementDto } from './dtos/update-measurement.dto';

@Injectable()
export class BodyMeasurementsService {
  constructor(private readonly prismaService: PrismaService) {}

  async findMeasurementById(userId: number, measurementId: number) {
    const measurement = await this.prismaService.bodyMeasurement.findUnique({
      where: {
        id: measurementId,
        userId,
      },
    });

    if (!measurement) {
      throw new NotFoundException('Found no measurement by this id');
    }

    return measurement;
  }

  findMeasurements(userId: number) {
    return this.prismaService.bodyMeasurement.findMany({
      where: { userId },
      orderBy: { measuredAt: 'desc' },
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
