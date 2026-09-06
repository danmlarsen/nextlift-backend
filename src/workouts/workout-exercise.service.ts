import {
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateWorkoutExerciseDto } from './dtos/create-workout-exercise.dto';
import { UpdateWorkoutExerciseDto } from './dtos/update-workout-exercise.dto';
import { FULL_WORKOUT_INCLUDE } from './const/full-workout-include';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PersonalRecordsService } from 'src/personal-records/personal-records.service';
import { SYSTEM_USER_ID } from 'src/common/constants';
import {
  findPreviousWorkoutExercise,
  PreviousWorkoutExercise,
} from './utils/previous-workout-exercise';

@Injectable()
export class WorkoutExerciseService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly personalRecordsService: PersonalRecordsService,
    @InjectPinoLogger(WorkoutExerciseService.name)
    private readonly logger: PinoLogger,
  ) {}

  async createWorkoutExercise(
    userId: number,
    workoutId: number,
    data: CreateWorkoutExerciseDto,
  ) {
    this.logger.info(`Creating workout exercise`, { userId, workoutId, data });
    try {
      const [workout, exercise] = await Promise.all([
        this.prismaService.workout.findFirst({
          where: { id: workoutId, userId },
        }),
        this.prismaService.exercise.findFirst({
          where: {
            id: data.exerciseId,
            OR: [{ userId }, { userId: SYSTEM_USER_ID }],
          },
          select: { id: true },
        }),
      ]);

      if (!workout || !exercise) {
        this.logger.warn(
          `User tried to add an unavailable exercise or modify a workout they do not own`,
          { userId, workoutId, exerciseId: data.exerciseId },
        );
        throw new ForbiddenException('Not allowed');
      }

      const maxOrder: { _max: { exerciseOrder: number | null } } =
        await this.prismaService.workoutExercise.aggregate({
          where: { workoutId },
          _max: { exerciseOrder: true },
        });

      const nextOrder = (maxOrder._max.exerciseOrder ?? 0) + 1;

      const previousWorkoutExercise = await this.findPreviousWorkoutExercise(
        userId,
        data.exerciseId,
        workout.startedAt,
      );

      // Create sets based on previous structure or default to single set
      const setsToCreate =
        previousWorkoutExercise &&
        previousWorkoutExercise.workoutSets.length > 0
          ? previousWorkoutExercise.workoutSets.map((_, index) => ({
              setNumber: index + 1,
            }))
          : [{ setNumber: 1 }];

      return await this.prismaService.workout.update({
        where: { id: workoutId },
        data: {
          workoutExercises: {
            create: {
              exerciseId: data.exerciseId,
              exerciseOrder: nextOrder,
              previousWorkoutExerciseId: previousWorkoutExercise?.id,
              workoutSets: {
                create: setsToCreate,
              },
            },
          },
        },
        include: FULL_WORKOUT_INCLUDE,
      });
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to create workout exercise`, {
        userId,
        workoutId,
        data,
        error,
      });
      throw new InternalServerErrorException(
        'Failed to create workout exercise',
      );
    }
  }

  async updateWorkoutExercise(
    userId: number,
    id: number,
    data: UpdateWorkoutExerciseDto,
  ) {
    this.logger.info(`Updating workout exercise`, { userId, id, data });
    try {
      const workoutExercise =
        await this.prismaService.workoutExercise.findUnique({
          where: { id },
          include: {
            workout: true,
          },
        });

      if (!workoutExercise || workoutExercise.workout.userId !== userId) {
        this.logger.warn(
          `User tried to update a workout exercise that does not exist or they do not own`,
          {
            userId,
            id,
          },
        );
        throw new ForbiddenException('Not allowed');
      }

      return await this.prismaService.workout.update({
        where: { id: workoutExercise.workoutId },
        data: {
          workoutExercises: {
            update: {
              where: { id },
              data,
            },
          },
        },
        include: FULL_WORKOUT_INCLUDE,
      });
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to update workout exercise`, {
        userId,
        id,
        data,
        error,
      });
      throw new InternalServerErrorException(
        'Failed to update workout exercise',
      );
    }
  }

  async deleteWorkoutExercise(userId: number, id: number) {
    this.logger.info(`Deleting workout exercise`, { userId, id });
    try {
      const workoutExercise =
        await this.prismaService.workoutExercise.findUnique({
          where: { id },
          include: {
            workout: true,
          },
        });

      if (!workoutExercise || workoutExercise.workout.userId !== userId) {
        this.logger.warn(
          `User tried to delete a workout exercise that does not exist or they do not own`,
          {
            userId,
            id,
          },
        );
        throw new ForbiddenException('Not allowed');
      }

      // Records anchored to this exercise's sets cascade away with the
      // delete; re-derive them afterwards. On lookup failure assume some do.
      let hadRecords = true;
      try {
        hadRecords =
          (await this.prismaService.personalRecord.count({
            where: { userId, workoutSet: { workoutExerciseId: id } },
          })) > 0;
      } catch (error: unknown) {
        this.logger.error(`Personal record lookup failed`, {
          userId,
          id,
          error,
        });
      }

      const updatedWorkout = await this.prismaService.workout.update({
        where: { id: workoutExercise.workoutId },
        data: {
          workoutExercises: {
            delete: { id },
          },
        },
        include: FULL_WORKOUT_INCLUDE,
      });

      if (hadRecords) {
        try {
          await this.personalRecordsService.recomputeForExercises(userId, [
            workoutExercise.exerciseId,
          ]);
        } catch (error: unknown) {
          this.logger.error(`Personal record recompute failed`, {
            userId,
            id,
            error,
          });
        }
      }

      return updatedWorkout;
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to delete workout exercise`, {
        userId,
        id,
        error,
      });
      throw new InternalServerErrorException(
        'Failed to delete workout exercise',
      );
    }
  }

  async getWorkoutExerciseSets(userId: number, id: number) {
    this.logger.info(`Getting workout exercise sets`, { userId, id });
    try {
      const workoutExercise =
        await this.prismaService.workoutExercise.findUnique({
          where: { id },
          include: {
            workout: true,
            workoutSets: true,
            exercise: true,
          },
        });

      if (!workoutExercise || workoutExercise.workout.userId !== userId) {
        this.logger.warn(
          `User tried to get workout exercise sets for an exercise that does not exist or they do not own`,
          {
            userId,
            id,
          },
        );
        throw new ForbiddenException('Not allowed');
      }

      return workoutExercise;
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to get workout exercise sets`, {
        userId,
        id,
        error,
      });
      throw new InternalServerErrorException(
        'Failed to get workout exercise sets',
      );
    }
  }

  findPreviousWorkoutExercise(
    userId: number,
    exerciseId: number,
    currentWorkoutStartedAt: Date,
  ): Promise<PreviousWorkoutExercise | null> {
    return findPreviousWorkoutExercise(
      this.prismaService,
      userId,
      exerciseId,
      currentWorkoutStartedAt,
    );
  }
}
