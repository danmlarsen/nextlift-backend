import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseDatePipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CreateWorkoutExerciseDto } from './dtos/create-workout-exercise.dto';
import { CreateWorkoutSetDto } from './dtos/create-workout-set.dto';
import { UpdateWorkoutDto } from './dtos/update-workout.dto';
import { UpdateWorkoutSetDto } from './dtos/update-workout-set.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { type AuthUser } from 'src/common/types/auth-user.interface';
import { WorkoutManagementService } from './workout-management.service';
import { WorkoutExerciseService } from './workout-exercise.service';
import { WorkoutSetService } from './workout-set.service';
import { WorkoutQueryService } from './workout-query.service';
import { UpdateWorkoutExerciseDto } from './dtos/update-workout-exercise.dto';
import { CreateWorkoutDto } from './dtos/create-workout.dto';
import { ApiBearerAuth } from '@nestjs/swagger';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workouts')
export class WorkoutsController {
  constructor(
    private readonly workoutManagement: WorkoutManagementService,
    private readonly workoutExercise: WorkoutExerciseService,
    private readonly workoutSet: WorkoutSetService,
    private readonly workoutQuery: WorkoutQueryService,
  ) {}

  /**
   * Get a paginated list of completed workouts
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   */
  @Get()
  getCompletedWorkouts(
    @CurrentUser() user: AuthUser,
    @Query('cursor', new ParseIntPipe({ optional: true })) cursor?: number,
    @Query('from', new ParseDatePipe({ optional: true })) from?: Date,
    @Query('to', new ParseDatePipe({ optional: true })) to?: Date,
  ) {
    return this.workoutQuery.getCompletedWorkouts(user.id, {
      cursor,
      from,
      to,
    });
  }

  /**
   * Get the total count of completed workouts
   * @throws {401} Unauthorized.
   */
  @Get('count')
  getCompletedWorkoutsCount(@CurrentUser() user: AuthUser) {
    return this.workoutQuery.getCompletedWorkoutsCount(user.id);
  }

  /**
   * Get a workout calendar for a given year
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   */
  @Get('calendar')
  getWorkoutCalendar(
    @CurrentUser() user: AuthUser,
    @Query('from', new ParseDatePipe({ optional: true })) from?: Date,
    @Query('to', new ParseDatePipe({ optional: true })) to?: Date,
  ) {
    return this.workoutQuery.getWorkoutCalendar(user.id, {
      from,
      to,
    });
  }

  /**
   * Get workout statistics for a date range
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   */
  @Get('stats')
  getWorkoutStats(
    @CurrentUser() user: AuthUser,
    @Query('from', new ParseDatePipe({ optional: true })) from?: Date,
    @Query('to', new ParseDatePipe({ optional: true })) to?: Date,
  ) {
    return this.workoutQuery.getWorkoutStats(user.id, {
      from,
      to,
    });
  }

  /**
   * Get the current active workout
   * @throws {401} Unauthorized.
   * @throws {404} No active workout found.
   */
  @Get('active')
  getActiveWorkout(@CurrentUser() user: AuthUser) {
    return this.workoutManagement.getWorkout(user.id, { status: 'ACTIVE' });
  }

  /**
   * Get a specific workout by ID
   * @throws {401} Unauthorized.
   * @throws {404} Workout not found.
   */
  @Get(':workoutId')
  getWorkout(
    @Param('workoutId', ParseIntPipe) workoutId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.workoutManagement.getWorkout(user.id, { id: workoutId });
  }

  /**
   * Create a new draft workout
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   */
  @Post('')
  createDraftWorkout(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateWorkoutDto,
  ) {
    return this.workoutManagement.createDraftWorkout(user.id, body);
  }

  /**
   * Create a new active workout
   * @throws {401} Unauthorized.
   * @throws {409} Active workout already exists.
   */
  @Post('active')
  createActiveWorkout(@CurrentUser() user: AuthUser) {
    return this.workoutManagement.createActiveWorkout(user.id);
  }

  /**
   * Pause the current active workout
   * @throws {401} Unauthorized.
   * @throws {404} No active workout found.
   */
  @Patch('active/pause')
  pauseActiveWorkout(@CurrentUser() user: AuthUser) {
    return this.workoutManagement.pauseActiveWorkout(user.id);
  }

  /**
   * Resume the current paused workout
   * @throws {401} Unauthorized.
   * @throws {404} No paused workout found.
   */
  @Patch('active/resume')
  resumeActiveWorkout(@CurrentUser() user: AuthUser) {
    return this.workoutManagement.resumeActiveWorkout(user.id);
  }

  /**
   * Complete a workout by ID
   * @throws {401} Unauthorized.
   * @throws {404} Workout not found.
   */
  @Post(':workoutId/complete')
  completeWorkout(
    @Param('workoutId', ParseIntPipe) workoutId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.workoutManagement.completeWorkout(user.id, workoutId);
  }

  /**
   * Delete the current active workout
   * @throws {401} Unauthorized.
   * @throws {404} No active workout found.
   */
  @Delete('active')
  deleteActiveWorkout(@CurrentUser() user: AuthUser) {
    return this.workoutManagement.deleteActiveWorkout(user.id);
  }

  /**
   * Update a workout by ID
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   * @throws {404} Workout not found.
   */
  @Patch(':workoutId')
  updateWorkout(
    @Param('workoutId', ParseIntPipe) workoutId: number,
    @CurrentUser() user: AuthUser,
    @Body() body: UpdateWorkoutDto,
  ) {
    return this.workoutManagement.updateWorkout(workoutId, user.id, body);
  }

  /**
   * Delete a workout by ID
   * @throws {401} Unauthorized.
   * @throws {404} Workout not found.
   */
  @Delete(':workoutId')
  deleteWorkout(
    @Param('workoutId', ParseIntPipe) workoutId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.workoutManagement.deleteWorkout(workoutId, user.id);
  }

  /**
   * Add an exercise to a workout
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   * @throws {404} Workout not found.
   */
  @Post(':workoutId/workoutExercises')
  createWorkoutExercise(
    @CurrentUser() user: AuthUser,
    @Param('workoutId', ParseIntPipe) workoutId: number,
    @Body() body: CreateWorkoutExerciseDto,
  ) {
    return this.workoutExercise.createWorkoutExercise(user.id, workoutId, body);
  }

  /**
   * Update a workout exercise by ID
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   * @throws {404} Workout exercise not found.
   */
  @Patch(':workoutId/workoutExercises/:workoutExerciseId')
  updateWorkoutExercise(
    @CurrentUser() user: AuthUser,
    @Param('workoutId', ParseIntPipe) workoutId: number,
    @Param('workoutExerciseId', ParseIntPipe) workoutExerciseId: number,
    @Body() body: UpdateWorkoutExerciseDto,
  ) {
    return this.workoutExercise.updateWorkoutExercise(
      user.id,
      workoutExerciseId,
      body,
    );
  }

  /**
   * Delete a workout exercise by ID
   * @throws {401} Unauthorized.
   * @throws {404} Workout exercise not found.
   */
  @Delete(':workoutId/workoutExercises/:workoutExerciseId')
  deleteWorkoutExercise(
    @CurrentUser() user: AuthUser,
    @Param('workoutId', ParseIntPipe) workoutId: number,
    @Param('workoutExerciseId', ParseIntPipe) workoutExerciseId: number,
  ) {
    return this.workoutExercise.deleteWorkoutExercise(
      user.id,
      workoutExerciseId,
    );
  }

  /**
   * Get all sets for a workout exercise
   * @throws {401} Unauthorized.
   * @throws {404} Workout exercise not found.
   */
  @Get(':workoutId/workoutExercises/:workoutExerciseId/sets')
  getWorkoutExerciseSets(
    @CurrentUser() user: AuthUser,
    @Param('workoutId', ParseIntPipe) workoutId: number,
    @Param('workoutExerciseId', ParseIntPipe) workoutExerciseId: number,
  ) {
    return this.workoutExercise.getWorkoutExerciseSets(
      user.id,
      workoutExerciseId,
    );
  }

  /**
   * Add a set to a workout exercise
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   * @throws {404} Workout exercise not found.
   */
  @Post(':workoutId/workoutExercises/:workoutExerciseId/sets')
  createWorkoutSet(
    @CurrentUser() user: AuthUser,
    @Param('workoutId', ParseIntPipe) workoutId: number,
    @Param('workoutExerciseId', ParseIntPipe) workoutExerciseId: number,
    @Body() body: CreateWorkoutSetDto,
  ) {
    return this.workoutSet.createWorkoutSet(workoutExerciseId, user.id, body);
  }

  /**
   * Update a set for a workout exercise
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   * @throws {404} Set not found.
   */
  @Patch(':workoutId/workoutExercises/:workoutExerciseId/sets/:setId')
  updateWorkoutSet(
    @Param('workoutId', ParseIntPipe) workoutId: number,
    @Param('workoutExerciseId', ParseIntPipe) workoutExerciseId: number,
    @Param('setId', ParseIntPipe) setId: number,
    @CurrentUser() user: AuthUser,
    @Body() body: UpdateWorkoutSetDto,
  ) {
    return this.workoutSet.updateWorkoutSet(setId, user.id, body);
  }

  /**
   * Delete a set from a workout exercise
   * @throws {401} Unauthorized.
   * @throws {404} Set not found.
   */
  @Delete(':workoutId/workoutExercises/:workoutExerciseId/sets/:setId')
  deleteWorkoutSet(
    @Param('workoutId', ParseIntPipe) workoutId: number,
    @Param('workoutExerciseId', ParseIntPipe) workoutExerciseId: number,
    @Param('setId', ParseIntPipe) setId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.workoutSet.deleteWorkoutSet(setId, user.id);
  }
}
