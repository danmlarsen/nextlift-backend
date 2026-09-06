import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { type AuthUser } from 'src/common/types/auth-user.interface';
import {
  EnrollDto,
  PositionDto,
  StartProgramWorkoutDto,
  SwapExerciseDto,
  UpdateEnrollmentStateDto,
} from './dtos/enrollment.dto';
import { EnrollmentWorkoutService } from './enrollment-workout.service';
import { EnrollmentService } from './enrollment.service';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('program-enrollments')
export class ProgramEnrollmentsController {
  constructor(
    private readonly enrollment: EnrollmentService,
    private readonly enrollmentWorkout: EnrollmentWorkoutService,
  ) {}

  /**
   * List the user's enrollments (active and past, without snapshots)
   * @throws {401} Unauthorized.
   */
  @Get()
  listProgramEnrollments(@CurrentUser() user: AuthUser) {
    return this.enrollment.getEnrollments(user.id);
  }

  /**
   * Enroll in a program (only one active enrollment at a time)
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   * @throws {403} Program not found.
   * @throws {409} Already following a program.
   */
  @Post('')
  createProgramEnrollment(
    @CurrentUser() user: AuthUser,
    @Body() body: EnrollDto,
  ) {
    return this.enrollment.enroll(user.id, body);
  }

  /**
   * The active enrollment with its schedule for the given local date
   * (yyyy-MM-dd), or null when the user is not following a program
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   */
  @Get('active')
  getActiveProgramEnrollment(
    @CurrentUser() user: AuthUser,
    @Query('date') date?: string,
  ) {
    return this.enrollment.getActiveEnrollment(user.id, date);
  }

  /**
   * Get an enrollment with its schedule
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   * @throws {403} Enrollment not found.
   */
  @Get(':enrollmentId')
  getProgramEnrollment(
    @CurrentUser() user: AuthUser,
    @Param('enrollmentId', ParseIntPipe) enrollmentId: number,
    @Query('date') date?: string,
  ) {
    return this.enrollment.getEnrollment(user.id, enrollmentId, date);
  }

  /**
   * Delete a finished or abandoned enrollment (workouts are kept)
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   * @throws {403} Enrollment not found.
   */
  @Delete(':enrollmentId')
  deleteProgramEnrollment(
    @CurrentUser() user: AuthUser,
    @Param('enrollmentId', ParseIntPipe) enrollmentId: number,
  ) {
    return this.enrollment.deleteEnrollment(user.id, enrollmentId);
  }

  /**
   * Adherence per week and main-lift trends for an enrollment
   * @throws {401} Unauthorized.
   * @throws {403} Enrollment not found.
   */
  @Get(':enrollmentId/progress')
  getProgramEnrollmentProgress(
    @CurrentUser() user: AuthUser,
    @Param('enrollmentId', ParseIntPipe) enrollmentId: number,
    @Query('date') date?: string,
  ) {
    return this.enrollment.getProgress(user.id, enrollmentId, date);
  }

  /**
   * Preview the prescriptions of a program day
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   * @throws {403} Enrollment not found.
   */
  @Get(':enrollmentId/days/:cycle/:weekIndex/:dayIndex')
  previewProgramEnrollmentDay(
    @CurrentUser() user: AuthUser,
    @Param('enrollmentId', ParseIntPipe) enrollmentId: number,
    @Param('cycle', ParseIntPipe) cycle: number,
    @Param('weekIndex', ParseIntPipe) weekIndex: number,
    @Param('dayIndex', ParseIntPipe) dayIndex: number,
  ) {
    return this.enrollment.previewDay(user.id, enrollmentId, {
      cycle,
      weekIndex,
      dayIndex,
    });
  }

  /**
   * Start a workout for a program day (defaults to the next day)
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   * @throws {403} Enrollment not found.
   * @throws {409} Active workout exists, or the day was already done.
   */
  @Post(':enrollmentId/workouts')
  startProgramWorkout(
    @CurrentUser() user: AuthUser,
    @Param('enrollmentId', ParseIntPipe) enrollmentId: number,
    @Body() body: StartProgramWorkoutDto,
  ) {
    return this.enrollmentWorkout.startWorkout(user.id, enrollmentId, body);
  }

  /**
   * Skip a program day
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   * @throws {403} Enrollment not found.
   * @throws {409} Day already completed or started.
   */
  @Post(':enrollmentId/days/skip')
  skipProgramEnrollmentDay(
    @CurrentUser() user: AuthUser,
    @Param('enrollmentId', ParseIntPipe) enrollmentId: number,
    @Body() body: PositionDto,
    @Query('date') date?: string,
  ) {
    return this.enrollment.skipDay(user.id, enrollmentId, body, date);
  }

  /**
   * Jump to another day or week (sequence programs move the pointer and
   * mark passed days skipped; calendar programs shift their start date)
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   * @throws {403} Enrollment not found.
   */
  @Patch(':enrollmentId/position')
  updateProgramEnrollmentPosition(
    @CurrentUser() user: AuthUser,
    @Param('enrollmentId', ParseIntPipe) enrollmentId: number,
    @Body() body: PositionDto,
    @Query('date') date?: string,
  ) {
    return this.enrollment.setPosition(user.id, enrollmentId, body, date);
  }

  /**
   * Manually adjust a progression slot (working weight, training max, ...)
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   * @throws {403} Enrollment or slot not found.
   */
  @Patch(':enrollmentId/states/:progressionKey')
  updateProgramEnrollmentState(
    @CurrentUser() user: AuthUser,
    @Param('enrollmentId', ParseIntPipe) enrollmentId: number,
    @Param('progressionKey') progressionKey: string,
    @Body() body: UpdateEnrollmentStateDto,
  ) {
    return this.enrollment.updateState(
      user.id,
      enrollmentId,
      progressionKey,
      body,
    );
  }

  /**
   * Swap an exercise for the rest of the enrollment
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   * @throws {403} Enrollment not found.
   * @throws {404} Exercise not found.
   */
  @Post(':enrollmentId/swaps')
  swapProgramEnrollmentExercise(
    @CurrentUser() user: AuthUser,
    @Param('enrollmentId', ParseIntPipe) enrollmentId: number,
    @Body() body: SwapExerciseDto,
  ) {
    return this.enrollment.swapExercise(user.id, enrollmentId, body);
  }

  /**
   * Start the next cycle of a finished program, keeping progression state
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   * @throws {403} Enrollment not found.
   */
  @Post(':enrollmentId/next-cycle')
  startNextProgramCycle(
    @CurrentUser() user: AuthUser,
    @Param('enrollmentId', ParseIntPipe) enrollmentId: number,
  ) {
    return this.enrollment.nextCycle(user.id, enrollmentId);
  }

  /**
   * Mark the active enrollment completed
   * @throws {401} Unauthorized.
   * @throws {403} Enrollment not found.
   */
  @Post(':enrollmentId/complete')
  completeProgramEnrollment(
    @CurrentUser() user: AuthUser,
    @Param('enrollmentId', ParseIntPipe) enrollmentId: number,
  ) {
    return this.enrollment.completeEnrollment(user.id, enrollmentId);
  }

  /**
   * Abandon the active enrollment (history is kept)
   * @throws {401} Unauthorized.
   * @throws {403} Enrollment not found.
   */
  @Post(':enrollmentId/abandon')
  abandonProgramEnrollment(
    @CurrentUser() user: AuthUser,
    @Param('enrollmentId', ParseIntPipe) enrollmentId: number,
  ) {
    return this.enrollment.abandonEnrollment(user.id, enrollmentId);
  }
}
