import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateMeasurementDto } from './dtos/create-measurement.dto';
import { UpdateMeasurementDto } from './dtos/update-measurement.dto';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

@Injectable()
export class BodyMeasurementsService {
  constructor(
    private readonly prismaService: PrismaService,
    @InjectPinoLogger(BodyMeasurementsService.name)
    private readonly logger: PinoLogger,
  ) {}

  async findMeasurementById(userId: number, measurementId: number) {
    this.logger.info(`Fetching measurement by id`, { userId, measurementId });
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
    this.logger.info(`Fetching all measurements`, { userId });
    return this.prismaService.bodyMeasurement.findMany({
      where: { userId },
      orderBy: { measuredAt: 'desc' },
    });
  }

  createMeasurement(userId: number, data: CreateMeasurementDto) {
    this.logger.info(`Creating new measurement`, { userId });
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
    this.logger.info(`Updating measurement`, { userId, measurementId });
    return this.prismaService.bodyMeasurement.update({
      where: {
        id: measurementId,
        userId,
      },
      data,
    });
  }

  deleteMeasurement(userId: number, measurementId: number) {
    this.logger.info(`Deleting measurement`, { userId, measurementId });
    return this.prismaService.bodyMeasurement.delete({
      where: {
        id: measurementId,
        userId,
      },
    });
  }
}
