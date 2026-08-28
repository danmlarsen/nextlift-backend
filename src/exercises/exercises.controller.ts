import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseArrayPipe,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ExercisesService } from './exercises.service';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { type AuthUser } from 'src/common/types/auth-user.interface';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CreateExerciseDto } from './dtos/create-exercise.dto';
import { UpdateExerciseDto } from './dtos/update-exercise.dto';
import { ApiBearerAuth } from '@nestjs/swagger';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('exercises')
export class ExercisesController {
  constructor(private readonly exercisesService: ExercisesService) {}

  /**
   * Get all exercises for the current user
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   */
  @Get()
  getAllExercises(
    @CurrentUser() user: AuthUser,
    @Query('cursor', new ParseIntPipe({ optional: true })) cursor?: number,
    @Query('name') name?: string,
    @Query('targetMuscleGroups', new ParseArrayPipe({ optional: true }))
    targetMuscleGroups?: string[],
    @Query('equipment', new ParseArrayPipe({ optional: true }))
    equipment?: string[],
  ) {
    return this.exercisesService.findAllExercises(user.id, {
      cursor,
      filters: { name, targetMuscleGroups, equipment },
    });
  }

  /** Get the current user's favorite exercise IDs. */
  @Get('favorites')
  getFavoriteExercises(@CurrentUser() user: AuthUser) {
    return this.exercisesService.getFavoriteExerciseIds(user.id);
  }

  /** Add an available exercise to the current user's favorites. */
  @Put(':exerciseId/favorite')
  favoriteExercise(
    @CurrentUser() user: AuthUser,
    @Param('exerciseId', ParseIntPipe) exerciseId: number,
  ) {
    return this.exercisesService.favoriteExercise(user.id, exerciseId);
  }

  /** Remove an exercise from the current user's favorites. */
  @Delete(':exerciseId/favorite')
  unfavoriteExercise(
    @CurrentUser() user: AuthUser,
    @Param('exerciseId', ParseIntPipe) exerciseId: number,
  ) {
    return this.exercisesService.unfavoriteExercise(user.id, exerciseId);
  }

  /**
   * Get a specific exercise by ID
   * @throws {401} Unauthorized.
   * @throws {404} Exercise not found.
   */
  @Get(':exerciseId')
  getExercise(
    @CurrentUser() user: AuthUser,
    @Param('exerciseId', ParseIntPipe) exerciseId: number,
  ) {
    return this.exercisesService.findExerciseById(user.id, exerciseId);
  }

  /**
   * Create a new exercise
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   * @throws {409} Exercise already exists.
   */
  @Post()
  createExercise(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateExerciseDto,
  ) {
    return this.exercisesService.createExercise(user.id, body);
  }

  /**
   * Update an existing exercise
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   * @throws {404} Exercise not found.
   */
  @Patch(':exerciseId')
  updateExercise(
    @CurrentUser() user: AuthUser,
    @Param('exerciseId', ParseIntPipe) exerciseId: number,
    @Body() body: UpdateExerciseDto,
  ) {
    return this.exercisesService.updateExercise(user.id, exerciseId, body);
  }

  /**
   * Delete an exercise
   * @throws {401} Unauthorized.
   * @throws {404} Exercise not found.
   */
  @Delete(':exerciseId')
  deleteExercise(
    @CurrentUser() user: AuthUser,
    @Param('exerciseId', ParseIntPipe) exerciseId: number,
  ) {
    return this.exercisesService.deleteExercise(user.id, exerciseId);
  }

  /**
   * Get weekly estimated-1RM chart data for a specific exercise
   * @throws {401} Unauthorized.
   * @throws {404} Exercise not found.
   */
  @Get(':exerciseId/chart')
  getExerciseChartData(
    @CurrentUser() user: AuthUser,
    @Param('exerciseId', ParseIntPipe) exerciseId: number,
  ) {
    return this.exercisesService.getExerciseChartData(user.id, exerciseId);
  }

  /**
   * Get workouts that use a specific exercise
   * @throws {401} Unauthorized.
   * @throws {404} Exercise not found.
   */
  @Get(':exerciseId/workouts')
  getExerciseWorkouts(
    @CurrentUser() user: AuthUser,
    @Param('exerciseId', ParseIntPipe) exerciseId: number,
    @Query('cursor', new ParseIntPipe({ optional: true })) cursor?: number,
  ) {
    return this.exercisesService.getExerciseWorkouts(user.id, exerciseId, {
      cursor,
    });
  }
}
