import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { UpdateWorkoutDto } from './dtos/update-workout.dto';
import { Prisma, WorkoutStatus } from '@prisma/client';
import { CreateWorkoutDto } from './dtos/create-workout.dto';
import { FULL_WORKOUT_INCLUDE } from './const/full-workout-include';
import { PinoLogger } from 'nestjs-pino/PinoLogger';
import { InjectPinoLogger } from 'nestjs-pino';
import { PersonalRecordsService } from 'src/personal-records/personal-records.service';

@Injectable()
export class WorkoutManagementService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly personalRecordsService: PersonalRecordsService,
    @InjectPinoLogger(WorkoutManagementService.name)
    private readonly logger: PinoLogger,
  ) {}

  /**
   * Exercises with a record anchored in this workout. Captured before a
   * destructive change so the records can be re-derived afterwards; returns
   * an empty list on failure (a stale record self-heals on the next write).
   */
  private async getRecordExerciseIds(
    userId: number,
    workoutId: number,
  ): Promise<number[]> {
    try {
      const records = await this.prismaService.personalRecord.findMany({
        where: { userId, workoutSet: { workoutExercise: { workoutId } } },
        select: { exerciseId: true },
        distinct: ['exerciseId'],
      });
      return records.map((record) => record.exerciseId);
    } catch (error: unknown) {
      this.logger.error(`Personal record lookup failed`, {
        userId,
        workoutId,
        error,
      });
      return [];
    }
  }

  private async recomputeRecords(userId: number, exerciseIds: number[]) {
    if (exerciseIds.length === 0) return;
    try {
      await this.personalRecordsService.recomputeForExercises(
        userId,
        exerciseIds,
      );
    } catch (error: unknown) {
      this.logger.error(`Personal record recompute failed`, {
        userId,
        exerciseIds,
        error,
      });
    }
  }

  async getWorkout(
    userId: number,
    options?: { id?: number; status?: WorkoutStatus },
  ) {
    const whereClause: Prisma.WorkoutWhereInput = {
      userId,
      id: options?.id,
      status: options?.status,
    };
    this.logger.info(`Getting workout`, { userId, options });
    try {
      const workout = await this.prismaService.workout.findFirst({
        where: whereClause,
        orderBy: { startedAt: 'desc' },
        include: FULL_WORKOUT_INCLUDE,
      });

      // Expire active workouts after 12 hours
      if (workout && workout.status === 'ACTIVE') {
        const startedAt = new Date(workout.startedAt);
        const now = new Date();
        const twelveHoursInMs = 12 * 60 * 60 * 1000; // 12 hours in milliseconds

        // Check if 12 hours have passed since the workout started
        if (now.getTime() - startedAt.getTime() >= twelveHoursInMs) {
          const expiredAt = new Date(startedAt.getTime() + twelveHoursInMs);

          await this.prismaService.workout.update({
            where: { id: workout.id },
            data: {
              status: 'COMPLETED',
              completedAt: expiredAt,
            },
          });
          return null;
        }
      }

      return workout;
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to get workout`, { userId, options, error });
      throw error;
    }
  }

  async updateWorkout(id: number, userId: number, data: UpdateWorkoutDto) {
    this.logger.info(`Updating workout`, { userId, id, data });
    try {
      const workout = await this.getWorkout(userId, { id });

      if (!workout) {
        this.logger.warn(
          `User tried to update a workout that does not exist or they do not own`,
          {
            userId,
            id,
          },
        );
        throw new ForbiddenException('Not allowed');
      }

      if (workout.status === 'ACTIVE' && data.activeDuration) {
        this.logger.warn(
          `User tried to update activeDuration of an active workout`,
          {
            userId,
            id,
            data,
          },
        );
        throw new ForbiddenException('Not allowed');
      }

      // Re-dating a workout changes the achievedAt of records anchored in it.
      const affectedExerciseIds =
        data.startedAt !== undefined
          ? await this.getRecordExerciseIds(userId, id)
          : [];

      const updatedWorkout = await this.prismaService.workout.update({
        where: { id, userId },
        data,
        include: FULL_WORKOUT_INCLUDE,
      });

      await this.recomputeRecords(userId, affectedExerciseIds);

      return updatedWorkout;
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to update workout`, {
        userId,
        id,
        data,
        error,
      });
      throw new InternalServerErrorException('Failed to update workout');
    }
  }

  async deleteWorkout(id: number, userId: number) {
    this.logger.info(`Deleting workout`, { userId, id });
    try {
      // Captured before the delete: the cascade removes the anchored rows.
      const affectedExerciseIds = await this.getRecordExerciseIds(userId, id);

      const deletedWorkout = await this.prismaService.workout.delete({
        where: { id, userId },
        include: FULL_WORKOUT_INCLUDE,
      });

      await this.recomputeRecords(userId, affectedExerciseIds);

      return deletedWorkout;
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to delete workout`, { userId, id, error });
      throw new InternalServerErrorException('Failed to delete workout');
    }
  }

  async createDraftWorkout(userId: number, data: CreateWorkoutDto) {
    this.logger.info(`Creating draft workout`, { userId, data });
    try {
      await this.prismaService.workout.deleteMany({
        where: { userId, status: 'DRAFT' },
      });

      return await this.prismaService.workout.create({
        data: { ...data, userId, status: 'DRAFT' },
        include: FULL_WORKOUT_INCLUDE,
      });
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to create draft workout`, {
        userId,
        data,
        error,
      });
      throw new InternalServerErrorException('Failed to create draft workout');
    }
  }

  async createActiveWorkout(userId: number) {
    this.logger.info(`Creating active workout`, { userId });
    try {
      const foundWorkout = await this.getWorkout(userId, { status: 'ACTIVE' });
      if (foundWorkout) {
        this.logger.warn(
          `User tried to create an active workout but already has one`,
          { userId },
        );
        throw new ConflictException('Already have an active workout');
      }

      return await this.prismaService.workout.create({
        data: { userId, status: 'ACTIVE' },
        include: FULL_WORKOUT_INCLUDE,
      });
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to create active workout`, { userId, error });
      throw new InternalServerErrorException('Failed to create active workout');
    }
  }

  async completeWorkout(userId: number, workoutId: number) {
    this.logger.info(`Completing workout`, { userId, workoutId });
    try {
      const workout = await this.prismaService.workout.findFirst({
        where: {
          id: workoutId,
          userId,
          OR: [{ status: 'ACTIVE' }, { status: 'DRAFT' }],
        },
      });

      if (!workout) {
        this.logger.warn(
          `User tried to complete a workout that does not exist or they do not own`,
          {
            userId,
            workoutId,
          },
        );
        throw new ForbiddenException('Not allowed');
      }

      const now = new Date();

      const activeDuration =
        workout.status === 'ACTIVE'
          ? Math.floor(
              new Date(
                now.getTime() -
                  workout.startedAt.getTime() -
                  workout.pauseDuration,
              ).getTime() / 1000,
            )
          : workout.activeDuration;

      return await this.prismaService.workout.update({
        where: { id: workoutId },
        data: {
          status: 'COMPLETED',
          completedAt: now,
          activeDuration,
        },
        include: FULL_WORKOUT_INCLUDE,
      });
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to complete workout`, {
        userId,
        workoutId,
        error,
      });
      throw new InternalServerErrorException('Failed to complete workout');
    }
  }

  async deleteActiveWorkout(userId: number) {
    this.logger.info(`Deleting active workout`, { userId });
    try {
      const workout = await this.getWorkout(userId, { status: 'ACTIVE' });

      if (!workout) {
        this.logger.warn(
          `User tried to delete an active workout that does not exist or they do not own`,
          {
            userId,
          },
        );
        throw new ForbiddenException('Not allowed');
      }

      // Captured before the delete: the cascade removes the anchored rows.
      const affectedExerciseIds = await this.getRecordExerciseIds(
        userId,
        workout.id,
      );

      const deletedWorkout = await this.prismaService.workout.delete({
        where: { id: workout.id },
        include: FULL_WORKOUT_INCLUDE,
      });

      await this.recomputeRecords(userId, affectedExerciseIds);

      return deletedWorkout;
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to delete active workout`, { userId, error });
      throw new InternalServerErrorException('Failed to delete active workout');
    }
  }

  async pauseActiveWorkout(userId: number) {
    this.logger.info(`Pausing active workout`, { userId });
    try {
      const workout = await this.getWorkout(userId, { status: 'ACTIVE' });

      if (!workout) {
        this.logger.warn(
          `User tried to pause an active workout that does not exist or they do not own`,
          {
            userId,
          },
        );
        throw new ForbiddenException('Not allowed');
      }

      if (workout.isPaused) {
        this.logger.warn(
          `User tried to pause an active workout that is already paused`,
          {
            userId,
            workoutId: workout.id,
          },
        );
        throw new BadRequestException('Workout is already paused');
      }

      return await this.prismaService.workout.update({
        where: { id: workout.id },
        data: {
          isPaused: true,
          lastPauseStartTime: new Date(),
        },
        include: FULL_WORKOUT_INCLUDE,
      });
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to pause active workout`, { userId, error });
      throw new InternalServerErrorException('Failed to pause active workout');
    }
  }

  async resumeActiveWorkout(userId: number) {
    this.logger.info(`Resuming active workout`, { userId });
    try {
      const workout = await this.getWorkout(userId, { status: 'ACTIVE' });

      if (!workout) {
        this.logger.warn(
          `User tried to resume an active workout that does not exist or they do not own`,
          {
            userId,
          },
        );
        throw new ForbiddenException('Not allowed');
      }

      if (!workout.isPaused || !workout.lastPauseStartTime) {
        this.logger.warn(
          `User tried to resume an active workout that is not currently paused`,
          {
            userId,
            workoutId: workout.id,
          },
        );
        throw new BadRequestException('Workout is not currently paused');
      }

      const now = new Date();
      const lastPauseStartTime = new Date(workout.lastPauseStartTime);
      const lastPauseDuration = Math.max(
        0,
        now.getTime() - lastPauseStartTime.getTime(),
      );

      return await this.prismaService.workout.update({
        where: { id: workout.id },
        data: {
          isPaused: false,
          lastPauseStartTime: null,
          pauseDuration: (workout.pauseDuration || 0) + lastPauseDuration,
        },
        include: FULL_WORKOUT_INCLUDE,
      });
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to resume active workout`, { userId, error });
      throw new InternalServerErrorException('Failed to resume active workout');
    }
  }
}
