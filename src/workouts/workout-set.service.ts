import {
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateWorkoutSetDto } from './dtos/create-workout-set.dto';
import { UpdateWorkoutSetDto } from './dtos/update-workout-set.dto';
import { FULL_WORKOUT_INCLUDE } from './const/full-workout-include';
import { InjectPinoLogger } from 'nestjs-pino/InjectPinoLogger';
import { PinoLogger } from 'nestjs-pino';
import { PersonalRecordsService } from 'src/personal-records/personal-records.service';
import { NewRecord } from 'src/personal-records/types/personal-record.types';

@Injectable()
export class WorkoutSetService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly personalRecordsService: PersonalRecordsService,
    @InjectPinoLogger(WorkoutSetService.name)
    private readonly logger: PinoLogger,
  ) {}

  async createWorkoutSet(
    workoutExerciseId: number,
    userId: number,
    data: CreateWorkoutSetDto,
  ) {
    this.logger.info(`Creating workout set`, {
      workoutExerciseId,
      userId,
      data,
    });
    try {
      const workoutExercise =
        await this.prismaService.workoutExercise.findUnique({
          where: { id: workoutExerciseId },
          include: { workout: true },
        });

      if (!workoutExercise || workoutExercise.workout.userId !== userId) {
        this.logger.warn(
          `User tried to create workout set for a workout exercise that does not exist or they do not own`,
          {
            workoutExerciseId,
            userId,
          },
        );
        throw new ForbiddenException('Not allowed');
      }

      return await this.prismaService.$transaction(async (tx) => {
        const maxSetNumber: { _max: { setNumber: number | null } } =
          await tx.workoutSet.aggregate({
            where: { workoutExerciseId },
            _max: { setNumber: true },
          });

        const nextSetNumber = (maxSetNumber._max.setNumber ?? 0) + 1;

        return tx.workout.update({
          where: { id: workoutExercise.workoutId },
          data: {
            workoutExercises: {
              update: {
                where: { id: workoutExerciseId },
                data: {
                  workoutSets: {
                    create: {
                      ...data,
                      setNumber: nextSetNumber,
                    },
                  },
                },
              },
            },
          },
          include: FULL_WORKOUT_INCLUDE,
        });
      });
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to create workout set`, {
        workoutExerciseId,
        userId,
        data,
        error,
      });
      throw new InternalServerErrorException('Failed to create workout set');
    }
  }

  async updateWorkoutSet(
    id: number,
    userId: number,
    data: UpdateWorkoutSetDto,
  ) {
    this.logger.info(`Updating workout set`, { id, userId, data });
    try {
      const workoutSet = await this.prismaService.workoutSet.findUnique({
        where: { id },
        include: {
          workoutExercise: {
            include: { workout: true, exercise: { select: { name: true } } },
          },
        },
      });

      if (!workoutSet || workoutSet.workoutExercise.workout.userId !== userId) {
        this.logger.warn(
          `User tried to update a workout set that does not exist or they do not own`,
          {
            id,
            userId,
          },
        );
        throw new ForbiddenException('Not allowed');
      }

      const updatedWorkout = await this.prismaService.workout.update({
        where: { id: workoutSet.workoutExercise.workoutId },
        data: {
          workoutExercises: {
            update: {
              where: { id: workoutSet.workoutExerciseId },
              data: {
                workoutSets: {
                  update: {
                    where: {
                      id,
                    },
                    data,
                  },
                },
              },
            },
          },
        },
        include: FULL_WORKOUT_INCLUDE,
      });

      // A failure while detecting records must never fail the set update.
      let newRecords: NewRecord[] = [];
      try {
        newRecords = await this.personalRecordsService.handleSetWrite(userId, {
          exerciseId: workoutSet.workoutExercise.exerciseId,
          exerciseName: workoutSet.workoutExercise.exercise.name,
          workoutStartedAt: workoutSet.workoutExercise.workout.startedAt,
          set: {
            id: workoutSet.id,
            completed:
              data.completed !== undefined
                ? data.completed
                : workoutSet.completed,
            type: data.type !== undefined ? data.type : workoutSet.type,
            weight: data.weight !== undefined ? data.weight : workoutSet.weight,
            reps: data.reps !== undefined ? data.reps : workoutSet.reps,
            duration:
              data.duration !== undefined ? data.duration : workoutSet.duration,
          },
        });
      } catch (error: unknown) {
        this.logger.error(`Personal record detection failed`, {
          id,
          userId,
          error,
        });
      }

      return { ...updatedWorkout, newRecords };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to update workout set`, {
        id,
        userId,
        data,
        error,
      });
      throw new InternalServerErrorException('Failed to update workout set');
    }
  }

  async deleteWorkoutSet(id: number, userId: number) {
    this.logger.info(`Deleting workout set`, { id, userId });
    try {
      const workoutSet = await this.prismaService.workoutSet.findUnique({
        where: { id },
        include: {
          workoutExercise: {
            include: { workout: true },
          },
        },
      });

      if (!workoutSet || workoutSet.workoutExercise.workout.userId !== userId) {
        this.logger.warn(
          `User tried to delete a workout set that does not exist or they do not own`,
          {
            id,
            userId,
          },
        );
        throw new ForbiddenException('Not allowed');
      }

      // If the set holds a record, its row cascades away with the delete and
      // the next-best must be re-derived. On lookup failure assume it does.
      let hadRecord = true;
      try {
        hadRecord =
          (await this.prismaService.personalRecord.count({
            where: { workoutSetId: id },
          })) > 0;
      } catch (error: unknown) {
        this.logger.error(`Personal record lookup failed`, {
          id,
          userId,
          error,
        });
      }

      const updatedWorkout = await this.prismaService.$transaction(
        async (tx) => {
          await tx.workoutSet.updateMany({
            where: {
              workoutExerciseId: workoutSet.workoutExerciseId,
              setNumber: {
                gt: workoutSet.setNumber,
              },
            },
            data: {
              setNumber: {
                decrement: 1,
              },
            },
          });

          return tx.workout.update({
            where: { id: workoutSet.workoutExercise.workoutId },
            data: {
              workoutExercises: {
                update: {
                  where: { id: workoutSet.workoutExerciseId },
                  data: {
                    workoutSets: {
                      delete: { id },
                    },
                  },
                },
              },
            },
            include: FULL_WORKOUT_INCLUDE,
          });
        },
      );

      if (hadRecord) {
        try {
          await this.personalRecordsService.recomputeForExercises(userId, [
            workoutSet.workoutExercise.exerciseId,
          ]);
        } catch (error: unknown) {
          this.logger.error(`Personal record recompute failed`, {
            id,
            userId,
            error,
          });
        }
      }

      return updatedWorkout;
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to delete workout set`, { id, userId, error });
      throw new InternalServerErrorException('Failed to delete workout set');
    }
  }
}
