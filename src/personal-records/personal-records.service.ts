import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PrismaService } from 'src/prisma/prisma.service';
import { WorkoutSetType } from 'src/workouts/types/workout.types';
import {
  RECORD_TYPE_DEFS,
  RECORD_TYPES,
  VALUE_EPSILON,
} from './const/record-type-defs';
import {
  EligibleSetInput,
  ExerciseRecords,
  NewRecord,
} from './types/personal-record.types';

@Injectable()
export class PersonalRecordsService {
  constructor(
    private readonly prismaService: PrismaService,
    @InjectPinoLogger(PersonalRecordsService.name)
    private readonly logger: PinoLogger,
  ) {}

  async getRecords(
    userId: number,
    options?: { workoutId?: number },
  ): Promise<ExerciseRecords[]> {
    this.logger.info(`Fetching personal records`, { userId, options });

    const where: Prisma.PersonalRecordWhereInput = { userId };
    if (options?.workoutId) {
      where.workoutSet = {
        workoutExercise: { workoutId: options.workoutId },
      };
    }

    const records = await this.prismaService.personalRecord.findMany({
      where,
      include: {
        exercise: { select: { name: true, category: true } },
        workoutSet: {
          select: { weight: true, reps: true, duration: true, setNumber: true },
        },
      },
      orderBy: [{ achievedAt: 'desc' }, { exerciseId: 'asc' }],
    });

    const byExercise = new Map<number, ExerciseRecords>();
    for (const record of records) {
      let group = byExercise.get(record.exerciseId);
      if (!group) {
        group = {
          exerciseId: record.exerciseId,
          exerciseName: record.exercise.name,
          exerciseCategory: record.exercise.category,
          records: [],
        };
        byExercise.set(record.exerciseId, group);
      }
      group.records.push({
        recordType: record.recordType,
        value: record.value,
        achievedAt: record.achievedAt,
        workoutSetId: record.workoutSetId,
        set: record.workoutSet,
      });
    }

    return Array.from(byExercise.values()).map((group) => ({
      ...group,
      records: group.records.sort(
        (a, b) =>
          RECORD_TYPES.indexOf(a.recordType) -
          RECORD_TYPES.indexOf(b.recordType),
      ),
    }));
  }

  /**
   * Compares a just-written set against the stored records for its exercise.
   * Strictly better values are upserted and reported back for celebration;
   * if the set holds a record it no longer earns, all record types for the
   * exercise are re-derived from history (without celebrating).
   */
  async handleSetWrite(
    userId: number,
    params: {
      exerciseId: number;
      exerciseName: string;
      workoutStartedAt: Date;
      set: EligibleSetInput;
    },
  ): Promise<NewRecord[]> {
    const { exerciseId, exerciseName, workoutStartedAt, set } = params;

    const existingRecords = await this.prismaService.personalRecord.findMany({
      where: { userId, exerciseId },
    });
    const existingByType = new Map(
      existingRecords.map((record) => [record.recordType, record]),
    );

    const newRecords: NewRecord[] = [];
    let needsRecompute = false;

    for (const recordType of RECORD_TYPES) {
      const def = RECORD_TYPE_DEFS[recordType];
      const existing = existingByType.get(recordType);
      const isHolder = existing?.workoutSetId === set.id;

      if (!def.isEligible(set)) {
        if (isHolder) needsRecompute = true;
        continue;
      }

      const value = def.getValue(set);

      if (!existing || value > existing.value + VALUE_EPSILON) {
        await this.prismaService.personalRecord.upsert({
          where: {
            userId_exerciseId_recordType: { userId, exerciseId, recordType },
          },
          create: {
            userId,
            exerciseId,
            recordType,
            value,
            achievedAt: workoutStartedAt,
            workoutSetId: set.id,
          },
          update: {
            value,
            achievedAt: workoutStartedAt,
            workoutSetId: set.id,
          },
        });
        newRecords.push({
          recordType,
          exerciseId,
          exerciseName,
          value,
          previousValue: existing?.value ?? null,
          workoutSetId: set.id,
          achievedAt: workoutStartedAt,
        });
      } else if (isHolder && value < existing.value - VALUE_EPSILON) {
        needsRecompute = true;
      }
      // Equal value (within the epsilon band): keep the earlier achievement.
    }

    if (needsRecompute) {
      await this.recomputeForExercises(userId, [exerciseId]);
    }

    if (newRecords.length > 0) {
      this.logger.info(`New personal records`, {
        userId,
        exerciseId,
        recordTypes: newRecords.map((record) => record.recordType),
      });
    }

    return newRecords;
  }

  /**
   * Re-derives the records for the given exercises from all remaining
   * eligible sets. Winners are upserted (even when the best value dropped)
   * and record types with no eligible sets left are deleted.
   */
  async recomputeForExercises(
    userId: number,
    exerciseIds: number[],
  ): Promise<void> {
    const uniqueExerciseIds = [...new Set(exerciseIds)];
    if (uniqueExerciseIds.length === 0) return;

    this.logger.info(`Recomputing personal records`, {
      userId,
      exerciseIds: uniqueExerciseIds,
    });

    const operations: Prisma.PrismaPromise<unknown>[] = [];

    for (const exerciseId of uniqueExerciseIds) {
      const sets = await this.prismaService.workoutSet.findMany({
        where: {
          completed: true,
          type: { not: WorkoutSetType.WARMUP },
          weight: { gt: 0 },
          workoutExercise: { exerciseId, workout: { userId } },
        },
        select: {
          id: true,
          completed: true,
          type: true,
          weight: true,
          reps: true,
          duration: true,
          workoutExercise: {
            select: { workout: { select: { startedAt: true } } },
          },
        },
      });

      for (const recordType of RECORD_TYPES) {
        const def = RECORD_TYPE_DEFS[recordType];
        const candidates = sets.filter((candidate) =>
          def.isEligible(candidate),
        );

        if (candidates.length === 0) {
          operations.push(
            this.prismaService.personalRecord.deleteMany({
              where: { userId, exerciseId, recordType },
            }),
          );
          continue;
        }

        // Highest value wins; ties go to the earliest workout, then lowest id
        // (the same tie-break as the backfill migration).
        const winner = candidates.reduce((best, current) => {
          const bestValue = def.getValue(best);
          const currentValue = def.getValue(current);
          if (currentValue !== bestValue) {
            return currentValue > bestValue ? current : best;
          }
          const bestDate = best.workoutExercise.workout.startedAt.getTime();
          const currentDate =
            current.workoutExercise.workout.startedAt.getTime();
          if (currentDate !== bestDate) {
            return currentDate < bestDate ? current : best;
          }
          return current.id < best.id ? current : best;
        });

        operations.push(
          this.prismaService.personalRecord.upsert({
            where: {
              userId_exerciseId_recordType: { userId, exerciseId, recordType },
            },
            create: {
              userId,
              exerciseId,
              recordType,
              value: def.getValue(winner),
              achievedAt: winner.workoutExercise.workout.startedAt,
              workoutSetId: winner.id,
            },
            update: {
              value: def.getValue(winner),
              achievedAt: winner.workoutExercise.workout.startedAt,
              workoutSetId: winner.id,
            },
          }),
        );
      }
    }

    await this.prismaService.$transaction(operations);
  }

  /**
   * Recomputes every exercise the user has ever logged. Used after demo
   * seeding, which inserts workout data directly and bypasses the write hooks.
   */
  async recomputeAllForUser(userId: number): Promise<void> {
    const workoutExercises = await this.prismaService.workoutExercise.findMany({
      where: { workout: { userId } },
      select: { exerciseId: true },
      distinct: ['exerciseId'],
    });

    await this.recomputeForExercises(
      userId,
      workoutExercises.map((workoutExercise) => workoutExercise.exerciseId),
    );
  }
}
