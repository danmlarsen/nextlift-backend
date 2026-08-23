import {
  Controller,
  Get,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { type AuthUser } from 'src/common/types/auth-user.interface';
import { PersonalRecordsService } from './personal-records.service';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('personal-records')
export class PersonalRecordsController {
  constructor(
    private readonly personalRecordsService: PersonalRecordsService,
  ) {}

  /**
   * Get the current personal records grouped by exercise
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   */
  @Get()
  getPersonalRecords(
    @CurrentUser() user: AuthUser,
    @Query('workoutId', new ParseIntPipe({ optional: true }))
    workoutId?: number,
  ) {
    return this.personalRecordsService.getRecords(user.id, { workoutId });
  }
}
