import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { type AuthUser } from 'src/common/types/auth-user.interface';
import { BodyMeasurementsService } from './body-measurements.service';
import { CreateMeasurementDto } from './dtos/create-measurement.dto';
import { UpdateMeasurementDto } from './dtos/update-measurement.dto';

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

  @Patch(':measurementId')
  updateMeasurement(
    @CurrentUser() user: AuthUser,
    @Param('measurementId', ParseIntPipe) measurementId: number,
    @Body() body: UpdateMeasurementDto,
  ) {
    return this.bodyMeasurementsService.updateMeasurement(
      user.id,
      measurementId,
      body,
    );
  }

  @Delete(':measurementId')
  deleteMeasurement(
    @CurrentUser() user: AuthUser,
    @Param('measurementId', ParseIntPipe) measurementId: number,
  ) {
    return this.bodyMeasurementsService.deleteMeasurement(
      user.id,
      measurementId,
    );
  }
}
