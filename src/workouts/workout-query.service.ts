import {
  HttpException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { Prisma, WorkoutSet } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { InjectPinoLogger } from 'nestjs-pino/InjectPinoLogger';
import { calculateOneRepMax } from 'src/common/utils';
import { PrismaService } from 'src/prisma/prisma.service';
import { WorkoutExerciseData } from './types/workout.types';
import { format, subMonths } from 'date-fns';

@Injectable()
export class WorkoutQueryService {
  constructor(
    private readonly prismaService: PrismaService,
    @InjectPinoLogger(WorkoutQueryService.name)
    private readonly logger: PinoLogger,
  ) {}

  async getCompletedWorkouts(
    userId: number,
    options?: {
      cursor?: number;
      from?: Date;
      to?: Date;
    },
  ) {
    const WORKOUT_LIMIT = 10;

    const whereClause: Prisma.WorkoutWhereInput = {
      userId,
      status: 'COMPLETED',
      startedAt: {
        gte: options?.from ? options.from : undefined,
        lte: options?.to ? options.to : undefined,
      },
    };

    this.logger.info(`Fetching completed workouts for user`, {
      userId,
      options,
    });
    try {
      const workouts = await this.prismaService.workout.findMany({
        where: whereClause,
        take: WORKOUT_LIMIT + 1,
        orderBy: { startedAt: 'desc' },
        ...(options?.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
        include: {
          workoutExercises: {
            orderBy: { exerciseOrder: 'asc' },
            include: {
              exercise: { select: { name: true, category: true } },
              workoutSets: {
                select: {
                  type: true,
                  reps: true,
                  weight: true,
                  duration: true,
                  completed: true,
                },
                orderBy: [{ setNumber: 'asc' }, { createdAt: 'asc' }],
              },
            },
          },
        },
      });

      const hasNextPage = workouts.length > WORKOUT_LIMIT;
      const rawResults = workouts.slice(0, WORKOUT_LIMIT);
      const nextCursor = hasNextPage
        ? rawResults[rawResults.length - 1].id
        : null;

      const transformedResults = rawResults.map((workout) => ({
        ...workout,
        totalWeight: this.calculateExerciseTotalWeight(
          workout.workoutExercises,
        ),
        totalCompletedSets: this.calculateExerciseCompletedSets(
          workout.workoutExercises,
        ),
        workoutExercises: this.compressWorkoutExercises(
          workout.workoutExercises,
        ).filter((we) => we.sets > 0),
      }));

      return {
        success: true,
        meta: {
          hasNextPage,
          nextCursor,
        },
        data: transformedResults,
      };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to fetch completed workouts for user`, {
        userId,
        error,
        options,
      });
      throw new InternalServerErrorException(
        'Failed to fetch completed workouts',
      );
    }
  }

  async getCompletedWorkoutsCount(userId: number) {
    this.logger.info(`Counting completed workouts for user`, { userId });
    try {
      return await this.prismaService.workout.count({
        where: { userId, status: 'COMPLETED' },
      });
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to count completed workouts`, {
        userId,
        error,
      });
      throw new InternalServerErrorException(
        'Failed to count completed workouts',
      );
    }
  }

  async getWorkoutStats(
    userId: number,
    options?: {
      from?: Date;
      to?: Date;
    },
  ) {
    const whereClause: Prisma.WorkoutWhereInput = {
      userId,
      status: 'COMPLETED',
      startedAt: {
        gte: options?.from ? options.from : undefined,
        lte: options?.to ? options.to : undefined,
      },
    };

    this.logger.info(`Calculating workout stats for user`, { userId, options });
    try {
      const [totalWorkouts, hoursResult, weightResult] = await Promise.all([
        // Total workouts count
        this.prismaService.workout.count({
          where: whereClause,
        }),

        // Total workout hours
        this.prismaService.$queryRaw<[{ total_hours: number }]>`
      SELECT 
        COALESCE(
          SUM("activeDuration") / 3600.0,
          0
        ) as total_hours
      FROM "Workout" 
      WHERE "userId" = ${userId} 
        AND "status" = 'COMPLETED'
        ${options?.from ? Prisma.sql`AND "startedAt" >= ${options.from}` : Prisma.empty}
        ${options?.to ? Prisma.sql`AND "startedAt" <= ${options.to}` : Prisma.empty}
    `,

        // Total weight lifted
        this.prismaService.$queryRaw<[{ total_weight: number }]>`
      SELECT 
        COALESCE(
          SUM(ws.weight * ws.reps), 
          0
        ) as total_weight
      FROM "WorkoutSet" ws
      INNER JOIN "WorkoutExercise" we ON ws."workoutExerciseId" = we.id
      INNER JOIN "Workout" w ON we."workoutId" = w.id
      WHERE w."userId" = ${userId}
        AND w."status" = 'COMPLETED'
        AND ws.weight IS NOT NULL
        AND ws.reps IS NOT NULL
        ${options?.from ? Prisma.sql`AND w."startedAt" >= ${options.from}` : Prisma.empty}
        ${options?.to ? Prisma.sql`AND w."startedAt" <= ${options.to}` : Prisma.empty}
    `,
      ]);

      return {
        totalWorkouts,
        totalHours: Math.round((hoursResult[0]?.total_hours || 0) * 100) / 100,
        totalWeightLifted:
          Math.round((weightResult[0]?.total_weight || 0) * 100) / 100,
      };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to calculate workout stats`, {
        userId,
        error,
        options,
      });
      throw new InternalServerErrorException(
        'Failed to calculate workout stats',
      );
    }
  }

  async getWorkoutCalendar(
    userId: number,
    options: {
      from: Date;
      to: Date;
    },
  ) {
    this.logger.info(`Fetching workout calendar for user`, { userId, options });
    try {
      const workouts = await this.prismaService.$queryRaw<
        Array<{ id: number; startedAt: Date }>
      >`
      SELECT id, "startedAt"
      FROM "Workout"
      WHERE "userId" = ${userId}
        AND "status" = 'COMPLETED' 
        ${options.from ? Prisma.sql`AND "startedAt" >= ${options.from}` : Prisma.empty}
        ${options.to ? Prisma.sql`AND "startedAt" <= ${options.to}` : Prisma.empty}
      ORDER BY "startedAt" ASC
      `;

      return {
        workoutDates: workouts.map((workout) => workout.startedAt),
        totalWorkouts: workouts.length,
      };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to fetch workout calendar`, {
        userId,
        error,
      });
      throw new InternalServerErrorException(
        'Failed to fetch workout calendar',
      );
    }
  }

  async getWorkoutChartData(userId: number) {
    try {
      const workouts = await this.prismaService.workout.findMany({
        where: {
          userId,
          status: 'COMPLETED',
          startedAt: { gte: subMonths(new Date(), 6) },
        },
        orderBy: { startedAt: 'asc' },
        include: {
          workoutExercises: {
            include: {
              exercise: { select: { name: true, category: true } },
              workoutSets: {
                select: {
                  type: true,
                  reps: true,
                  weight: true,
                  duration: true,
                  completed: true,
                },
              },
            },
          },
        },
      });

      // Aggregate by month
      const dataByMonth = workouts.reduce((acc, workout) => {
        const date = new Date(workout.startedAt);
        const monthKey = format(date, 'yyyy-MM');

        if (!acc.has(monthKey)) {
          acc.set(monthKey, {
            period: monthKey,
            workouts: 0,
            totalVolume: 0,
          });
        }

        const entry = acc.get(monthKey)!;
        entry.totalVolume += this.calculateExerciseTotalWeight(
          workout.workoutExercises,
        );
        entry.workouts++;
        return acc;
      }, new Map<string, { period: string; workouts: number; totalVolume: number }>());

      // Aggregate by week (ISO week format: yyyy-'W'ww)
      const dataByWeek = workouts.reduce((acc, workout) => {
        const date = new Date(workout.startedAt);
        const weekKey = format(date, "yyyy-'W'II"); // ISO week number

        if (!acc.has(weekKey)) {
          acc.set(weekKey, {
            period: weekKey,
            workouts: 0,
            totalVolume: 0,
          });
        }

        const entry = acc.get(weekKey)!;
        entry.totalVolume += this.calculateExerciseTotalWeight(
          workout.workoutExercises,
        );
        entry.workouts++;
        return acc;
      }, new Map<string, { period: string; workouts: number; totalVolume: number }>());

      // Aggregate by day
      const dataByDay = workouts.reduce((acc, workout) => {
        const date = new Date(workout.startedAt);
        const dayKey = format(date, 'yyyy-MM-dd');

        if (!acc.has(dayKey)) {
          acc.set(dayKey, {
            period: dayKey,
            workouts: 0,
            totalVolume: 0,
          });
        }

        const entry = acc.get(dayKey)!;
        entry.totalVolume += this.calculateExerciseTotalWeight(
          workout.workoutExercises,
        );
        entry.workouts++;
        return acc;
      }, new Map<string, { period: string; workouts: number; totalVolume: number }>());

      // Get latest periods for each aggregation
      const getLatestPeriods = (
        data: Map<
          string,
          { period: string; workouts: number; totalVolume: number }
        >,
        limit: number,
      ): Array<{ period: string; workouts: number; totalVolume: number }> => {
        return Array.from(data.entries())
          .sort(([a], [b]) => b.localeCompare(a)) // Sort descending by period key
          .slice(0, limit)
          .map(([, value]) => value)
          .reverse(); // Reverse to get chronological order
      };

      return {
        monthly: getLatestPeriods(dataByMonth, 6),
        weekly: getLatestPeriods(dataByWeek, 6),
        daily: getLatestPeriods(dataByDay, 6),
      };
    } catch {
      throw new InternalServerErrorException(
        'Failed to fetch workout graph data',
      );
    }
  }

  private calculateExerciseTotalWeight(
    exercises: WorkoutExerciseData[],
  ): number {
    return exercises.reduce(
      (total, exercise) =>
        total +
        exercise.workoutSets.reduce(
          (setTotal, curSet) =>
            setTotal +
            (curSet.completed ? (curSet.weight ?? 0) * (curSet.reps ?? 0) : 0),
          0,
        ),
      0,
    );
  }

  private calculateExerciseCompletedSets(exercises: WorkoutExerciseData[]) {
    return exercises.reduce(
      (total, exercise) =>
        total + exercise.workoutSets?.filter((set) => !!set.completed)?.length,
      0,
    );
  }

  private compressWorkoutExercises(workoutExercises: WorkoutExerciseData[]) {
    return workoutExercises.map((workoutExercise) => {
      const completedSets = workoutExercise.workoutSets.reduce(
        (sum, set) => (set.completed ? sum + 1 : sum),
        0,
      );

      let bestSet: Partial<WorkoutSet | null> = null;
      if (workoutExercise.exercise.category === 'strength') {
        bestSet = workoutExercise.workoutSets.reduce((best, current) => {
          const currentOneRM = calculateOneRepMax(
            current.weight!,
            current.reps!,
          );
          const bestOneRM = calculateOneRepMax(best.weight!, best.reps!);
          return currentOneRM > bestOneRM ? current : best;
        });
      }
      if (workoutExercise.exercise.category === 'cardio') {
        bestSet = workoutExercise.workoutSets.reduce((best, current) =>
          current.duration! > best.duration! ? current : best,
        );
      }

      return {
        exerciseName: workoutExercise.exercise.name,
        sets: completedSets,
        bestSet,
      };
    });
  }
}
