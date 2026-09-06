import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { Prisma, ProgramDayLogStatus } from '@prisma/client';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PrismaService } from 'src/prisma/prisma.service';
import { FULL_WORKOUT_INCLUDE } from 'src/workouts/const/full-workout-include';
import { findPreviousWorkoutExercise } from 'src/workouts/utils/previous-workout-exercise';
import { StartProgramWorkoutDto } from './dtos/enrollment.dto';
import { applyCycleEnd, applyResults } from './engine/apply-results';
import { resolveDay } from './engine/resolve-day';
import {
  comparePositions,
  findDay,
  isValidPosition,
  nextPosition,
} from './engine/schedule';
import {
  ExerciseState,
  Position,
  ProgressionEvent,
  SetResult,
} from './engine/types';
import { parseSnapshot } from './utils/program-snapshot';
import { mapResolvedSetsToWorkoutSetCreates } from './utils/resolved-set-copy.utils';

export type ProgressionSummary = {
  enrollmentId: number;
  position: Position;
  events: ProgressionEvent[];
  nextPosition: Position | null;
  nextDayName: string | null;
  programCompleted: boolean;
};

type StateRow = {
  progressionKey: string;
  exerciseId: number;
  workingWeight: number | null;
  trainingMax: number | null;
  e1rm: number | null;
  stageIndex: number;
  consecutiveFails: number;
  repsOffset: number;
  roundingKg: number | null;
};

export function toStateMap(rows: StateRow[]): Map<string, ExerciseState> {
  return new Map(
    rows.map((row) => [
      row.progressionKey,
      {
        progressionKey: row.progressionKey,
        exerciseId: row.exerciseId,
        workingWeight: row.workingWeight,
        trainingMax: row.trainingMax,
        e1rm: row.e1rm,
        stageIndex: row.stageIndex,
        consecutiveFails: row.consecutiveFails,
        repsOffset: row.repsOffset,
        roundingKg: row.roundingKg,
      },
    ]),
  );
}

export function stateUpsert(
  enrollmentId: number,
  state: ExerciseState,
): Prisma.ProgramEnrollmentExerciseStateUpsertArgs {
  const values = {
    exerciseId: state.exerciseId,
    workingWeight: state.workingWeight,
    trainingMax: state.trainingMax,
    e1rm: state.e1rm,
    stageIndex: state.stageIndex,
    consecutiveFails: state.consecutiveFails,
    repsOffset: state.repsOffset,
    roundingKg: state.roundingKg,
  };
  return {
    where: {
      enrollmentId_progressionKey: {
        enrollmentId,
        progressionKey: state.progressionKey,
      },
    },
    create: {
      enrollmentId,
      progressionKey: state.progressionKey,
      originalExerciseId: state.exerciseId,
      ...values,
    },
    update: values,
  };
}

/**
 * Turns a program day into a live workout and feeds completed workouts back
 * into the enrollment. Lives in the programs module; the workouts module calls
 * the hooks, never the other way round.
 */
@Injectable()
export class EnrollmentWorkoutService {
  constructor(
    private readonly prismaService: PrismaService,
    @InjectPinoLogger(EnrollmentWorkoutService.name)
    private readonly logger: PinoLogger,
  ) {}

  async startWorkout(
    userId: number,
    enrollmentId: number,
    data: StartProgramWorkoutDto,
  ) {
    this.logger.info(`Starting program workout`, {
      userId,
      enrollmentId,
      data,
    });
    try {
      const activeWorkout = await this.prismaService.workout.findFirst({
        where: { userId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (activeWorkout) {
        throw new ConflictException('Already have an active workout');
      }

      const enrollment = await this.prismaService.programEnrollment.findFirst({
        where: { id: enrollmentId, userId, status: 'ACTIVE' },
        include: { states: true },
      });
      if (!enrollment) {
        this.logger.warn(`Active enrollment not found`, {
          userId,
          enrollmentId,
        });
        throw new ForbiddenException('Not allowed');
      }

      const snapshot = parseSnapshot(enrollment.snapshot);
      const position: Position =
        data.weekIndex !== undefined && data.dayIndex !== undefined
          ? {
              cycle: data.cycle ?? enrollment.currentCycle,
              weekIndex: data.weekIndex,
              dayIndex: data.dayIndex,
            }
          : {
              cycle: enrollment.currentCycle,
              weekIndex: enrollment.currentWeekIndex,
              dayIndex: enrollment.currentDayIndex,
            };
      if (!isValidPosition(snapshot, position)) {
        throw new BadRequestException('Invalid program position');
      }

      const existingLog =
        await this.prismaService.programEnrollmentDayLog.findUnique({
          where: {
            enrollmentId_cycle_weekIndex_dayIndex: {
              enrollmentId,
              ...position,
            },
          },
          include: { workout: { select: { id: true } } },
        });
      if (existingLog?.status === ProgramDayLogStatus.COMPLETED) {
        throw new ConflictException('Day already completed');
      }
      if (
        existingLog?.status === ProgramDayLogStatus.STARTED &&
        existingLog.workout
      ) {
        throw new ConflictException('Day already started');
      }

      const day = resolveDay(snapshot, position, toStateMap(enrollment.states));
      if (!day) throw new BadRequestException('Invalid program position');

      const exerciseIds = [...new Set(day.exercises.map((e) => e.exerciseId))];
      const exercises = await this.prismaService.exercise.findMany({
        where: { id: { in: exerciseIds } },
        select: { id: true },
      });
      if (exercises.length !== exerciseIds.length) {
        throw new BadRequestException(
          'An exercise in this day no longer exists. Swap it before starting.',
        );
      }

      // One instant shared by the previous-exercise lookups and the workout.
      const startedAt = new Date();
      const previous = await Promise.all(
        day.exercises.map((exercise) =>
          findPreviousWorkoutExercise(
            this.prismaService,
            userId,
            exercise.exerciseId,
            startedAt,
          ),
        ),
      );

      return await this.prismaService.$transaction(async (tx) => {
        const log = existingLog
          ? await tx.programEnrollmentDayLog.update({
              where: { id: existingLog.id },
              data: {
                status: ProgramDayLogStatus.STARTED,
                startedAt,
                completedAt: null,
                dayName: day.dayName,
                programDayId: day.dayId,
              },
            })
          : await tx.programEnrollmentDayLog.create({
              data: {
                enrollmentId,
                ...position,
                programDayId: day.dayId,
                dayName: day.dayName,
                status: ProgramDayLogStatus.STARTED,
                startedAt,
              },
            });

        return tx.workout.create({
          data: {
            userId,
            status: 'ACTIVE',
            title: `${enrollment.programName} · ${day.dayName}`,
            startedAt,
            programDayLogId: log.id,
            workoutExercises: {
              create: day.exercises.map((exercise, index) => ({
                exerciseId: exercise.exerciseId,
                exerciseOrder: index + 1,
                progressionKey: exercise.progressionKey,
                notes: exercise.notes,
                previousWorkoutExerciseId: previous[index]?.id,
                workoutSets: {
                  create: mapResolvedSetsToWorkoutSetCreates(exercise.sets),
                },
              })),
            },
          },
          include: FULL_WORKOUT_INCLUDE,
        });
      });
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to start program workout`, {
        userId,
        enrollmentId,
        data,
        error,
      });
      throw new InternalServerErrorException('Failed to start program workout');
    }
  }

  /**
   * Completion hook. Idempotent: only a STARTED log is processed. Evaluates
   * the program-generated sets, persists the new slot states, marks the day
   * completed and advances the schedule. Never throws for callers that must
   * not fail — the workouts service wraps it in a try/catch.
   */
  async onWorkoutCompleted(
    userId: number,
    workoutId: number,
  ): Promise<ProgressionSummary | null> {
    const workout = await this.prismaService.workout.findFirst({
      where: { id: workoutId, userId },
      include: {
        programDayLog: true,
        workoutExercises: {
          include: { workoutSets: { where: { programSetId: { not: null } } } },
        },
      },
    });
    const log = workout?.programDayLog;
    if (!workout || !log || log.status !== ProgramDayLogStatus.STARTED)
      return null;

    const enrollment = await this.prismaService.programEnrollment.findUnique({
      where: { id: log.enrollmentId },
      include: { states: true },
    });
    if (!enrollment) return null;

    const snapshot = parseSnapshot(enrollment.snapshot);
    const position: Position = {
      cycle: log.cycle,
      weekIndex: log.weekIndex,
      dayIndex: log.dayIndex,
    };
    const results: SetResult[] = workout.workoutExercises.flatMap((exercise) =>
      exercise.workoutSets.map((set) => ({
        programSetId: set.programSetId!,
        type: set.type,
        completed: set.completed,
        reps: set.reps,
        weight: set.weight,
        rpe: set.rpe,
        prescribed: {
          repsMin: set.suggestedReps,
          repsMax: set.suggestedRepsMax ?? set.suggestedReps,
          isAmrap: set.suggestedAmrap,
          weight: set.suggestedWeight,
          targetRpe: set.suggestedRpe,
        },
      })),
    );

    const isActive = enrollment.status === 'ACTIVE';
    const statesByKey = toStateMap(enrollment.states);
    let states = statesByKey;
    let events: ProgressionEvent[] = [];
    const changedKeys = new Set<string>();

    if (isActive) {
      const outcome = applyResults(snapshot, position, statesByKey, results);
      states = outcome.states;
      events = outcome.events;
      outcome.changedKeys.forEach((key) => changedKeys.add(key));
    }

    const pointer: Position = {
      cycle: enrollment.currentCycle,
      weekIndex: enrollment.currentWeekIndex,
      dayIndex: enrollment.currentDayIndex,
    };
    const advance = isActive && comparePositions(position, pointer) >= 0;
    let next: Position | null = null;
    let programCompleted = false;
    if (advance) {
      next = nextPosition(snapshot, position);
      if (!next) {
        programCompleted = true;
      } else if (next.cycle > position.cycle) {
        const cycleOutcome = applyCycleEnd(snapshot, states);
        states = cycleOutcome.states;
        events = [...events, ...cycleOutcome.events];
        cycleOutcome.changedKeys.forEach((key) => changedKeys.add(key));
      }
    }

    const now = new Date();
    const enrollmentData: Prisma.ProgramEnrollmentUpdateInput = {};
    if (programCompleted) {
      enrollmentData.status = 'COMPLETED';
      enrollmentData.completedAt = now;
    } else if (next) {
      enrollmentData.currentCycle = next.cycle;
      enrollmentData.currentWeekIndex = next.weekIndex;
      enrollmentData.currentDayIndex = next.dayIndex;
    }

    await this.prismaService.$transaction([
      ...[...changedKeys].map((key) =>
        this.prismaService.programEnrollmentExerciseState.upsert(
          stateUpsert(enrollment.id, states.get(key)!),
        ),
      ),
      this.prismaService.programEnrollmentDayLog.update({
        where: { id: log.id },
        data: { status: ProgramDayLogStatus.COMPLETED, completedAt: now },
      }),
      ...(Object.keys(enrollmentData).length > 0
        ? [
            this.prismaService.programEnrollment.update({
              where: { id: enrollment.id },
              data: enrollmentData,
            }),
          ]
        : []),
    ]);

    this.logger.info(`Program workout completed`, {
      userId,
      workoutId,
      enrollmentId: enrollment.id,
      position,
      events: events.map((event) => `${event.progressionKey}:${event.kind}`),
    });

    return {
      enrollmentId: enrollment.id,
      position,
      events,
      nextPosition: next,
      nextDayName: next ? (findDay(snapshot, next)?.day.name ?? null) : null,
      programCompleted,
    };
  }

  /**
   * Deletion hook, called before a workout is removed. A day that was only
   * started becomes startable again; completed days keep their outcome.
   */
  async onWorkoutDeleted(userId: number, workoutId: number): Promise<void> {
    const log = await this.prismaService.programEnrollmentDayLog.findFirst({
      where: { workout: { id: workoutId, userId } },
      select: { id: true, status: true },
    });
    if (log?.status === ProgramDayLogStatus.STARTED) {
      await this.prismaService.programEnrollmentDayLog.delete({
        where: { id: log.id },
      });
    }
  }
}
