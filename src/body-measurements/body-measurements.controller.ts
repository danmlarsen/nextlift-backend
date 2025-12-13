import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { type AuthUser } from 'src/common/types/auth-user.interface';
import { BodyMeasurementsService } from './body-measurements.service';
import { CreateMeasurementDto } from './dtos/create-measurement.dto';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('body-measurements')
export class BodyMeasurementsController {
  constructor(
    private readonly bodyMeasurementsService: BodyMeasurementsService,
  ) {}

  @Get()
  getMeasurements(@CurrentUser() user: AuthUser) {
    return this.bodyMeasurementsService.findMeasurements(user.id);
  }

  @Post()
  createMeasurement(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateMeasurementDto,
  ) {
    return this.bodyMeasurementsService.createMeasurement(user.id, body);
  }
}
