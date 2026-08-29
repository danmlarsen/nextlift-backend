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
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { type AuthUser } from 'src/common/types/auth-user.interface';
import { TemplateManagementService } from './template-management.service';
import { TemplateExerciseService } from './template-exercise.service';
import { TemplateSetService } from './template-set.service';
import { CreateWorkoutTemplateDto } from './dtos/create-workout-template.dto';
import { UpdateWorkoutTemplateDto } from './dtos/update-workout-template.dto';
import { CreateTemplateFromWorkoutDto } from './dtos/create-template-from-workout.dto';
import { CreateTemplateExerciseDto } from './dtos/create-template-exercise.dto';
import { UpdateTemplateExerciseDto } from './dtos/update-template-exercise.dto';
import { CreateTemplateSetDto } from './dtos/create-template-set.dto';
import { UpdateTemplateSetDto } from './dtos/update-template-set.dto';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workout-templates')
export class WorkoutTemplatesController {
  constructor(
    private readonly templateManagement: TemplateManagementService,
    private readonly templateExercise: TemplateExerciseService,
    private readonly templateSet: TemplateSetService,
  ) {}

  /**
   * Get all workout templates for the current user
   * @throws {401} Unauthorized.
   */
  @Get()
  getWorkoutTemplates(@CurrentUser() user: AuthUser) {
    return this.templateManagement.getWorkoutTemplates(user.id);
  }

  /**
   * Create a new workout template
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   */
  @Post('')
  createWorkoutTemplate(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateWorkoutTemplateDto,
  ) {
    return this.templateManagement.createWorkoutTemplate(user.id, body);
  }

  /**
   * Create a workout template from an existing workout
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   * @throws {403} Workout not found.
   */
  @Post('from-workout')
  createTemplateFromWorkout(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateTemplateFromWorkoutDto,
  ) {
    return this.templateManagement.createTemplateFromWorkout(user.id, body);
  }

  /**
   * Get a specific workout template by ID
   * @throws {401} Unauthorized.
   * @throws {403} Workout template not found.
   */
  @Get(':templateId')
  getWorkoutTemplate(
    @Param('templateId', ParseIntPipe) templateId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.templateManagement.getWorkoutTemplate(user.id, templateId);
  }

  /**
   * Update a workout template by ID
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   * @throws {403} Workout template not found.
   */
  @Patch(':templateId')
  updateWorkoutTemplate(
    @Param('templateId', ParseIntPipe) templateId: number,
    @CurrentUser() user: AuthUser,
    @Body() body: UpdateWorkoutTemplateDto,
  ) {
    return this.templateManagement.updateWorkoutTemplate(
      user.id,
      templateId,
      body,
    );
  }

  /**
   * Delete a workout template by ID
   * @throws {401} Unauthorized.
   * @throws {403} Workout template not found.
   */
  @Delete(':templateId')
  deleteWorkoutTemplate(
    @Param('templateId', ParseIntPipe) templateId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.templateManagement.deleteWorkoutTemplate(user.id, templateId);
  }

  /**
   * Add an exercise to a workout template
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   * @throws {403} Workout template not found.
   */
  @Post(':templateId/templateExercises')
  createTemplateExercise(
    @CurrentUser() user: AuthUser,
    @Param('templateId', ParseIntPipe) templateId: number,
    @Body() body: CreateTemplateExerciseDto,
  ) {
    return this.templateExercise.createTemplateExercise(
      user.id,
      templateId,
      body,
    );
  }

  /**
   * Update a template exercise by ID
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   * @throws {403} Template exercise not found.
   */
  @Patch(':templateId/templateExercises/:templateExerciseId')
  updateTemplateExercise(
    @CurrentUser() user: AuthUser,
    @Param('templateId', ParseIntPipe) templateId: number,
    @Param('templateExerciseId', ParseIntPipe) templateExerciseId: number,
    @Body() body: UpdateTemplateExerciseDto,
  ) {
    return this.templateExercise.updateTemplateExercise(
      user.id,
      templateExerciseId,
      body,
    );
  }

  /**
   * Delete a template exercise by ID
   * @throws {401} Unauthorized.
   * @throws {403} Template exercise not found.
   */
  @Delete(':templateId/templateExercises/:templateExerciseId')
  deleteTemplateExercise(
    @CurrentUser() user: AuthUser,
    @Param('templateId', ParseIntPipe) templateId: number,
    @Param('templateExerciseId', ParseIntPipe) templateExerciseId: number,
  ) {
    return this.templateExercise.deleteTemplateExercise(
      user.id,
      templateExerciseId,
    );
  }

  /**
   * Add a set to a template exercise
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   * @throws {403} Template exercise not found.
   */
  @Post(':templateId/templateExercises/:templateExerciseId/sets')
  createTemplateSet(
    @CurrentUser() user: AuthUser,
    @Param('templateId', ParseIntPipe) templateId: number,
    @Param('templateExerciseId', ParseIntPipe) templateExerciseId: number,
    @Body() body: CreateTemplateSetDto,
  ) {
    return this.templateSet.createTemplateSet(
      templateExerciseId,
      user.id,
      body,
    );
  }

  /**
   * Update a set for a template exercise
   * @throws {401} Unauthorized.
   * @throws {400} Bad Request.
   * @throws {403} Template set not found.
   */
  @Patch(':templateId/templateExercises/:templateExerciseId/sets/:setId')
  updateTemplateSet(
    @Param('templateId', ParseIntPipe) templateId: number,
    @Param('templateExerciseId', ParseIntPipe) templateExerciseId: number,
    @Param('setId', ParseIntPipe) setId: number,
    @CurrentUser() user: AuthUser,
    @Body() body: UpdateTemplateSetDto,
  ) {
    return this.templateSet.updateTemplateSet(setId, user.id, body);
  }

  /**
   * Delete a set from a template exercise
   * @throws {401} Unauthorized.
   * @throws {403} Template set not found.
   */
  @Delete(':templateId/templateExercises/:templateExerciseId/sets/:setId')
  deleteTemplateSet(
    @Param('templateId', ParseIntPipe) templateId: number,
    @Param('templateExerciseId', ParseIntPipe) templateExerciseId: number,
    @Param('setId', ParseIntPipe) setId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.templateSet.deleteTemplateSet(setId, user.id);
  }
}
