import {
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateExerciseDto } from './dtos/create-exercise.dto';
import { UpdateExerciseDto } from './dtos/update-exercise.dto';
import { SYSTEM_USER_ID } from 'src/common/constants';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Prisma } from '@prisma/client';

type RankedExercise = {
  id: number;
  name: string;
  userId: number | null;
  category: string;
  targetMuscleGroups: string[];
  secondaryMuscleGroups: string[];
  equipment: string;
  instructions: string | null;
  imageUrls: string[];
  videoUrls: string[];
  isFavorite: boolean;
  timesUsed: number;
};

@Injectable()
export class ExercisesService {
  constructor(
    private readonly prismaService: PrismaService,
    @InjectPinoLogger(ExercisesService.name)
    private readonly logger: PinoLogger,
  ) {}

  async createExercise(userId: number | null, data: CreateExerciseDto) {
    this.logger.info(`Creating exercise for user ${userId}`, { userId, data });
    try {
      const foundExercise = await this.prismaService.exercise.findFirst({
        where: {
          name: data.name,
          userId: userId,
          equipment: data.equipment,
        },
      });

      if (foundExercise) {
        this.logger.warn(`User tried to create a duplicate exercise`, {
          userId,
          data,
        });
        throw new ConflictException('Exercise already exists');
      }

      const newExercise = await this.prismaService.exercise.create({
        data: { ...data, userId },
      });
      return newExercise;
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to create exercise for user`, {
        userId,
        data,
        error,
      });
      throw new InternalServerErrorException('Failed to create exercise');
    }
  }

  async findAllExercises(
    userId: number,
    options?: {
      cursor?: number;
      filters?: {
        name?: string;
        targetMuscleGroups?: string[];
        equipment?: string[];
      };
    },
  ) {
    const EXERCISE_LIMIT = 20;
    const offset = Math.max(options?.cursor ?? 0, 0);

    this.logger.info(`Fetching exercises`, { userId, options });
    try {
      const filters: Prisma.Sql[] = [
        Prisma.sql`(e."userId" = ${userId} OR e."userId" = ${SYSTEM_USER_ID})`,
      ];

      if (options?.filters?.name) {
        filters.push(Prisma.sql`e."name" ILIKE ${`%${options.filters.name}%`}`);
      }
      if (options?.filters?.targetMuscleGroups?.length) {
        filters.push(
          Prisma.sql`e."targetMuscleGroups" && ARRAY[${Prisma.join(options.filters.targetMuscleGroups)}]::text[]`,
        );
      }
      if (options?.filters?.equipment?.length) {
        filters.push(
          Prisma.sql`e."equipment" IN (${Prisma.join(options.filters.equipment)})`,
        );
      }

      // The per-user favorite and usage aggregates must be calculated before
      // pagination so every page follows the same global ranking.
      const exercises = await this.prismaService.$queryRaw<RankedExercise[]>(
        Prisma.sql`
          SELECT
            e."id",
            e."name",
            e."userId",
            e."category",
            e."targetMuscleGroups",
            e."secondaryMuscleGroups",
            e."equipment",
            e."instructions",
            e."imageUrls",
            e."videoUrls",
            EXISTS (
              SELECT 1
              FROM "ExerciseFavorite" ef
              WHERE ef."userId" = ${userId}
                AND ef."exerciseId" = e."id"
            ) AS "isFavorite",
            (
              SELECT COUNT(DISTINCT w."id")::integer
              FROM "WorkoutExercise" we
              INNER JOIN "Workout" w ON w."id" = we."workoutId"
              WHERE we."exerciseId" = e."id"
                AND w."userId" = ${userId}
                AND w."status" = 'COMPLETED'
            ) AS "timesUsed"
          FROM "Exercise" e
          WHERE ${Prisma.join(filters, ' AND ')}
          ORDER BY "isFavorite" DESC, "timesUsed" DESC, LOWER(e."name") ASC, e."id" ASC
          LIMIT ${EXERCISE_LIMIT + 1}
          OFFSET ${offset}
        `,
      );

      const hasNextPage = exercises.length > EXERCISE_LIMIT;
      const results = exercises.slice(0, EXERCISE_LIMIT);
      const nextCursor = hasNextPage ? offset + EXERCISE_LIMIT : null;

      return {
        success: true,
        meta: {
          hasNextPage,
          nextCursor,
        },
        data: results,
      };
    } catch (error: unknown) {
      this.logger.error(`Failed to fetch exercises for user`, {
        userId,
        options,
        error,
      });
      throw new InternalServerErrorException('Failed to fetch exercises');
    }
  }

  async findExerciseById(userId: number, exerciseId: number) {
    this.logger.info(`Fetching exercise by id`, { userId, exerciseId });
    try {
      const [exercise, timesUsed, favorite] = await Promise.all([
        this.prismaService.exercise.findFirst({
          where: {
            AND: [
              { id: exerciseId },
              { OR: [{ userId }, { userId: SYSTEM_USER_ID }] },
            ],
          },
        }),
        this.prismaService.workout.count({
          where: {
            userId,
            status: 'COMPLETED',
            workoutExercises: { some: { exerciseId } },
          },
        }),
        this.prismaService.exerciseFavorite.findUnique({
          where: { userId_exerciseId: { userId, exerciseId } },
          select: { exerciseId: true },
        }),
      ]);

      if (!exercise) {
        this.logger.warn(`No exercise found with this id`, {
          userId,
          exerciseId,
        });
        throw new NotFoundException('found no exercise with this id');
      }

      return {
        ...exercise,
        isFavorite: favorite !== null,
        timesUsed,
      };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to fetch exercise for user`, {
        userId,
        exerciseId,
        error,
      });
      throw new InternalServerErrorException('Failed to fetch exercise');
    }
  }

  async getFavoriteExerciseIds(userId: number) {
    this.logger.info(`Fetching favorite exercises`, { userId });
    try {
      const favorites = await this.prismaService.exerciseFavorite.findMany({
        where: { userId },
        select: { exerciseId: true },
      });

      return { exerciseIds: favorites.map(({ exerciseId }) => exerciseId) };
    } catch (error: unknown) {
      this.logger.error(`Failed to fetch favorite exercises`, {
        userId,
        error,
      });
      throw new InternalServerErrorException(
        'Failed to fetch favorite exercises',
      );
    }
  }

  async favoriteExercise(userId: number, exerciseId: number) {
    this.logger.info(`Favoriting exercise`, { userId, exerciseId });
    try {
      await this.ensureExerciseAvailable(userId, exerciseId);
      await this.prismaService.exerciseFavorite.upsert({
        where: { userId_exerciseId: { userId, exerciseId } },
        create: { userId, exerciseId },
        update: {},
      });

      return { exerciseId, isFavorite: true };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to favorite exercise`, {
        userId,
        exerciseId,
        error,
      });
      throw new InternalServerErrorException('Failed to favorite exercise');
    }
  }

  async unfavoriteExercise(userId: number, exerciseId: number) {
    this.logger.info(`Unfavoriting exercise`, { userId, exerciseId });
    try {
      await this.ensureExerciseAvailable(userId, exerciseId);
      await this.prismaService.exerciseFavorite.deleteMany({
        where: { userId, exerciseId },
      });

      return { exerciseId, isFavorite: false };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to unfavorite exercise`, {
        userId,
        exerciseId,
        error,
      });
      throw new InternalServerErrorException('Failed to unfavorite exercise');
    }
  }

  async updateExercise(
    userId: number,
    exerciseId: number,
    data: UpdateExerciseDto,
  ) {
    this.logger.info(`Updating exercise`, { userId, exerciseId, data });
    try {
      const exercise = await this.prismaService.exercise.findFirst({
        where: { AND: [{ id: exerciseId }, { userId }] },
      });

      if (!exercise) {
        this.logger.warn(`No exercise found to update`, { userId, exerciseId });
        throw new NotFoundException('exercise not found');
      }

      return await this.prismaService.exercise.update({
        where: { id: exerciseId },
        data,
      });
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to update exercise for user`, {
        userId,
        exerciseId,
        data,
        error,
      });
      throw new InternalServerErrorException('Failed to update exercise');
    }
  }

  async deleteExercise(userId: number, exerciseId: number) {
    this.logger.info(`Deleting exercise`, { userId, exerciseId });
    try {
      const exercise = await this.prismaService.exercise.findFirst({
        where: { AND: [{ id: exerciseId }, { userId }] },
      });

      if (!exercise) {
        this.logger.warn(`No exercise found to delete`, { userId, exerciseId });
        throw new NotFoundException('Exercise not found');
      }

      return await this.prismaService.exercise.delete({
        where: { id: exerciseId },
      });
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to delete exercise for user`, {
        userId,
        exerciseId,
        error,
      });
      throw new InternalServerErrorException('Failed to delete exercise');
    }
  }

  async getExerciseWorkouts(
    userId: number,
    exerciseId: number,
    options?: { cursor?: number },
  ) {
    const WORKOUT_LIMIT = 10;

    this.logger.info(`Fetching workouts for exercise`, {
      userId,
      exerciseId,
      options,
    });
    try {
      const workouts = await this.prismaService.workout.findMany({
        where: {
          userId,
          status: 'COMPLETED',
          workoutExercises: {
            some: {
              exerciseId,
            },
          },
        },
        take: WORKOUT_LIMIT + 1,
        ...(options?.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
        include: {
          workoutExercises: {
            where: { exerciseId },
            include: {
              workoutSets: {
                where: { completed: true },
                orderBy: { setNumber: 'asc' },
              },
            },
          },
        },
        orderBy: {
          startedAt: 'desc',
        },
      });

      const hasNextPage = workouts.length > WORKOUT_LIMIT;
      const results = workouts.slice(0, WORKOUT_LIMIT);
      const nextCursor =
        hasNextPage && results.length > 0
          ? results[results.length - 1]?.id
          : null;

      const flattenedWorkouts = results.map(
        ({ workoutExercises, ...workout }) => ({
          ...workout,
          workoutSets: workoutExercises[0].workoutSets || [],
        }),
      );

      return {
        success: true,
        meta: {
          hasNextPage,
          nextCursor,
        },
        data: flattenedWorkouts,
      };
    } catch (error: unknown) {
      this.logger.error(`Failed to fetch workouts for exercise`, {
        userId,
        exerciseId,
        options,
        error,
      });
      throw new InternalServerErrorException(
        'Failed to fetch workouts for exercise',
      );
    }
  }

  private async ensureExerciseAvailable(userId: number, exerciseId: number) {
    const exercise = await this.prismaService.exercise.findFirst({
      where: {
        id: exerciseId,
        OR: [{ userId }, { userId: SYSTEM_USER_ID }],
      },
      select: { id: true },
    });

    if (!exercise) {
      throw new NotFoundException('Exercise not found');
    }
  }
}
