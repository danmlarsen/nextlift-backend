import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProgramDayLogStatus, RecordType } from '@prisma/client';
import { format } from 'date-fns';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { MAX_ENROLLMENTS_PER_USER, SYSTEM_USER_ID } from 'src/common/constants';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  ENROLLMENT_INCLUDE,
  ENROLLMENT_SUMMARY_SELECT,
  EnrollmentWithDetails,
} from './const/enrollment-include';
import {
  FULL_PROGRAM_INCLUDE,
  PROGRAM_EXERCISE_SELECT,
} from './const/full-program-include';
import {
  EnrollDto,
  PositionDto,
  SwapExerciseDto,
  UpdateEnrollmentStateDto,
} from './dtos/enrollment.dto';
import { applyCycleEnd } from './engine/apply-results';
import {
  collectSlots,
  deriveEnrollmentDefaults,
  ExerciseHistory,
  initialStateForSlot,
  requiredField,
} from './engine/enrollment-defaults';
import { resolveDay } from './engine/resolve-day';
import {
  comparePositions,
  firstPosition,
  isValidPosition,
  nextPosition,
  positionsBetween,
  startDateForWeek,
  totalWeeks,
} from './engine/schedule';
import {
  Position,
  ProgramSnapshot,
  ResolvedDay,
  SnapshotExerciseInfo as ExerciseInfo,
} from './engine/types';
import {
  EnrollmentWorkoutService,
  stateUpsert,
  toStateMap,
} from './enrollment-workout.service';
import { ProgramManagementService } from './program-management.service';
import {
  buildScheduleView,
  isIsoDate,
  todayString,
} from './utils/enrollment-view';
import { parseSnapshot, toSnapshot } from './utils/program-snapshot';
import {
  validateProgramForEnrollment,
  validateWeekdayMap,
} from './utils/validate-program';

@Injectable()
export class EnrollmentService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly enrollmentWorkout: EnrollmentWorkoutService,
    @InjectPinoLogger(EnrollmentService.name)
    private readonly logger: PinoLogger,
  ) {}

  private resolveLocalDate(date?: string): string {
    if (date === undefined || date === '') return todayString();
    if (!isIsoDate(date)) {
      throw new BadRequestException('date must be formatted as yyyy-MM-dd');
    }
    return date;
  }

  private async ownedEnrollment(
    userId: number,
    id: number,
    options: { active?: boolean } = {},
  ): Promise<EnrollmentWithDetails> {
    const enrollment = await this.prismaService.programEnrollment.findFirst({
      where: { id, userId, ...(options.active ? { status: 'ACTIVE' } : {}) },
      include: ENROLLMENT_INCLUDE,
    });
    if (!enrollment) {
      this.logger.warn(`Enrollment not found or not owned`, {
        userId,
        id,
        options,
      });
      throw new ForbiddenException('Not allowed');
    }
    return enrollment;
  }

  private async exerciseHistory(
    userId: number,
    exerciseIds: number[],
  ): Promise<Map<number, ExerciseHistory>> {
    const history = new Map<number, ExerciseHistory>();
    if (exerciseIds.length === 0) return history;
    for (const id of exerciseIds) {
      history.set(id, { lastWorkingWeight: null, e1rmRecord: null });
    }
    const [lastWeights, records] = await Promise.all([
      this.prismaService.$queryRaw<
        { exerciseId: number; weight: number }[]
      >(Prisma.sql`
        SELECT DISTINCT ON (we."exerciseId") we."exerciseId" AS "exerciseId", ws.weight::float AS weight
        FROM "WorkoutSet" ws
        JOIN "WorkoutExercise" we ON we.id = ws."workoutExerciseId"
        JOIN "Workout" w ON w.id = we."workoutId"
        WHERE w."userId" = ${userId}
          AND w.status = 'COMPLETED'
          AND ws.completed = true
          AND ws.type <> 'warmup'
          AND ws.weight > 0
          AND we."exerciseId" IN (${Prisma.join(exerciseIds)})
        ORDER BY we."exerciseId", w."startedAt" DESC, ws.weight DESC
      `),
      this.prismaService.personalRecord.findMany({
        where: {
          userId,
          recordType: RecordType.ONE_REP_MAX,
          exerciseId: { in: exerciseIds },
        },
        select: { exerciseId: true, value: true },
      }),
    ]);
    for (const row of lastWeights) {
      history.get(row.exerciseId)!.lastWorkingWeight = row.weight;
    }
    for (const record of records) {
      history.get(record.exerciseId)!.e1rmRecord = record.value;
    }
    return history;
  }

  private async readableSnapshot(userId: number, programId: number) {
    const program = await this.prismaService.program.findFirst({
      where: ProgramManagementService.readableWhere(userId, programId),
      include: FULL_PROGRAM_INCLUDE,
    });
    if (!program) {
      this.logger.warn(`Program not found or not readable`, {
        userId,
        programId,
      });
      throw new ForbiddenException('Not allowed');
    }
    return { program, snapshot: toSnapshot(program) };
  }

  /** Suggested starting values for every progression key of a program. */
  async getEnrollDefaults(userId: number, programId: number) {
    this.logger.info(`Getting enrollment defaults`, { userId, programId });
    try {
      const { snapshot } = await this.readableSnapshot(userId, programId);
      const exerciseIds = [
        ...new Set(
          collectSlots(snapshot).map((slot) => slot.exercise.exerciseId),
        ),
      ];
      const history = await this.exerciseHistory(userId, exerciseIds);
      return {
        programId,
        problems: validateProgramForEnrollment(snapshot),
        defaults: deriveEnrollmentDefaults(snapshot, history),
      };
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to get enrollment defaults`, {
        userId,
        programId,
        error,
      });
      throw new InternalServerErrorException(
        'Failed to get enrollment defaults',
      );
    }
  }

  async enroll(userId: number, data: EnrollDto) {
    this.logger.info(`Enrolling in program`, {
      userId,
      programId: data.programId,
    });
    try {
      const { program, snapshot } = await this.readableSnapshot(
        userId,
        data.programId,
      );

      const problems = validateProgramForEnrollment(snapshot);
      if (problems.length > 0) {
        throw new BadRequestException(problems.join('; '));
      }
      const weekdayProblems = validateWeekdayMap(snapshot, data.weekdayMap);
      if (weekdayProblems.length > 0) {
        throw new BadRequestException(weekdayProblems.join('; '));
      }

      const slots = collectSlots(snapshot);
      const inputs = new Map(
        (data.states ?? []).map((state) => [state.progressionKey, state]),
      );
      for (const key of inputs.keys()) {
        if (!slots.some((slot) => slot.progressionKey === key)) {
          throw new BadRequestException(`Unknown progression key ${key}`);
        }
      }

      const swappedIds = [
        ...new Set(
          [...inputs.values()]
            .map((input) => input.exerciseId)
            .filter((id): id is number => id !== undefined),
        ),
      ];
      if (swappedIds.length > 0) {
        const available = await this.prismaService.exercise.findMany({
          where: {
            id: { in: swappedIds },
            OR: [{ userId }, { userId: SYSTEM_USER_ID }],
          },
          select: { id: true },
        });
        if (available.length !== swappedIds.length) {
          throw new NotFoundException('Exercise not found');
        }
      }

      const history =
        (data.startWeightsMode ?? 'HISTORY') === 'HISTORY'
          ? await this.exerciseHistory(userId, [
              ...new Set(slots.map((slot) => slot.exercise.exerciseId)),
            ])
          : new Map<number, ExerciseHistory>();
      const suggested = new Map(
        deriveEnrollmentDefaults(snapshot, history).map((d) => [
          d.progressionKey,
          d,
        ]),
      );

      const states = slots.map((slot) => {
        const input = { ...(inputs.get(slot.progressionKey) ?? {}) };
        const field = requiredField(slot.params);
        const suggestion = suggested.get(slot.progressionKey);
        if (field && input[field] == null && suggestion?.suggested != null) {
          input[field] = suggestion.suggested;
        }
        return initialStateForSlot(slot, input);
      });

      const startDate = new Date(`${data.startDate}T00:00:00.000Z`);
      if (Number.isNaN(startDate.getTime())) {
        throw new BadRequestException('Invalid startDate');
      }

      return await this.prismaService.$transaction(async (tx) => {
        const active = await tx.programEnrollment.findFirst({
          where: { userId, status: 'ACTIVE' },
          select: { id: true },
        });
        if (active) {
          throw new ConflictException('Already following a program');
        }
        const count = await tx.programEnrollment.count({ where: { userId } });
        if (count >= MAX_ENROLLMENTS_PER_USER) {
          throw new BadRequestException('Enrollment limit reached');
        }
        return tx.programEnrollment.create({
          data: {
            userId,
            programId: program.id,
            programVersion: program.version,
            programName: program.name,
            totalWeeks: totalWeeks(snapshot),
            snapshot: snapshot,
            startDate,
            weekdayMap: data.weekdayMap
              ? (data.weekdayMap as Prisma.InputJsonValue)
              : Prisma.DbNull,
            states: {
              create: states.map((state) => ({
                progressionKey: state.progressionKey,
                exerciseId: state.exerciseId,
                originalExerciseId: state.exerciseId,
                workingWeight: state.workingWeight,
                trainingMax: state.trainingMax,
                e1rm: state.e1rm,
                roundingKg: state.roundingKg,
              })),
            },
          },
          include: ENROLLMENT_INCLUDE,
        });
      });
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to enroll in program`, { userId, data, error });
      throw new InternalServerErrorException('Failed to enroll in program');
    }
  }

  async getEnrollments(userId: number) {
    this.logger.info(`Listing enrollments`, { userId });
    try {
      return await this.prismaService.programEnrollment.findMany({
        where: { userId },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        select: ENROLLMENT_SUMMARY_SELECT,
      });
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to list enrollments`, { userId, error });
      throw new InternalServerErrorException('Failed to list enrollments');
    }
  }

  /** The active enrollment with its schedule, or null (like /workouts/active). */
  async getActiveEnrollment(userId: number, date?: string) {
    this.logger.info(`Getting active enrollment`, { userId, date });
    try {
      const localDate = this.resolveLocalDate(date);
      const enrollment = await this.prismaService.programEnrollment.findFirst({
        where: { userId, status: 'ACTIVE' },
        include: ENROLLMENT_INCLUDE,
      });
      if (!enrollment) return null;
      return await this.buildView(userId, enrollment, localDate);
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to get active enrollment`, { userId, error });
      throw new InternalServerErrorException('Failed to get active enrollment');
    }
  }

  async getEnrollment(userId: number, id: number, date?: string) {
    this.logger.info(`Getting enrollment`, { userId, id, date });
    try {
      const localDate = this.resolveLocalDate(date);
      const enrollment = await this.ownedEnrollment(userId, id);
      return await this.buildView(userId, enrollment, localDate);
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to get enrollment`, { userId, id, error });
      throw new InternalServerErrorException('Failed to get enrollment');
    }
  }

  /**
   * Repairs STARTED logs whose workout finished (a failed hook) or vanished,
   * then assembles the view. Returns the reloaded enrollment when repaired.
   */
  private async reconcile(
    userId: number,
    enrollment: EnrollmentWithDetails,
  ): Promise<EnrollmentWithDetails> {
    let changed = false;
    for (const log of enrollment.dayLogs) {
      if (log.status !== ProgramDayLogStatus.STARTED) continue;
      if (!log.workout) {
        await this.prismaService.programEnrollmentDayLog.delete({
          where: { id: log.id },
        });
        changed = true;
      } else if (log.workout.status === 'COMPLETED') {
        await this.enrollmentWorkout.onWorkoutCompleted(userId, log.workout.id);
        changed = true;
      }
    }
    if (!changed) return enrollment;
    return this.prismaService.programEnrollment.findUniqueOrThrow({
      where: { id: enrollment.id },
      include: ENROLLMENT_INCLUDE,
    });
  }

  /**
   * The engine resolves a day from the snapshot, so a swapped slot still
   * carries the original exercise's name. Overlay the live exercise.
   */
  private static overlayExercises<T extends ResolvedDay | null>(
    day: T,
    exerciseById: Map<number, ExerciseInfo>,
  ): T {
    if (!day) return day;
    return {
      ...day,
      exercises: day.exercises.map((exercise) => ({
        ...exercise,
        exercise: exerciseById.get(exercise.exerciseId) ?? exercise.exercise,
      })),
    };
  }

  private async liveExercises(exerciseIds: number[]) {
    const exercises = await this.prismaService.exercise.findMany({
      where: { id: { in: [...new Set(exerciseIds)] } },
      select: PROGRAM_EXERCISE_SELECT,
    });
    return new Map<number, ExerciseInfo>(
      exercises.map((exercise) => [exercise.id, exercise]),
    );
  }

  private async buildView(
    userId: number,
    loaded: EnrollmentWithDetails,
    localDate: string,
  ) {
    const enrollment = await this.reconcile(userId, loaded);
    const snapshot = parseSnapshot(enrollment.snapshot);
    const statesByKey = toStateMap(enrollment.states);
    const exerciseById = await this.liveExercises(
      enrollment.states.map((state) => state.exerciseId),
    );
    const { snapshot: _snapshot, ...rest } = enrollment;
    void _snapshot;
    const schedule = buildScheduleView(
      snapshot,
      enrollment,
      statesByKey,
      enrollment.dayLogs.map((log) => ({
        cycle: log.cycle,
        weekIndex: log.weekIndex,
        dayIndex: log.dayIndex,
        status: log.status,
        workoutId: log.workout?.id ?? null,
        completedAt: log.completedAt,
      })),
      localDate,
    );
    return {
      ...rest,
      snapshot,
      states: enrollment.states.map((state) => ({
        ...state,
        exercise: exerciseById.get(state.exerciseId) ?? null,
      })),
      schedule: {
        ...schedule,
        today: EnrollmentService.overlayExercises(schedule.today, exerciseById),
        next: EnrollmentService.overlayExercises(schedule.next, exerciseById),
      },
    };
  }

  async previewDay(userId: number, id: number, position: Position) {
    this.logger.info(`Previewing enrollment day`, { userId, id, position });
    try {
      const enrollment = await this.ownedEnrollment(userId, id);
      const snapshot = parseSnapshot(enrollment.snapshot);
      if (!isValidPosition(snapshot, position)) {
        throw new BadRequestException('Invalid program position');
      }
      const day = resolveDay(snapshot, position, toStateMap(enrollment.states));
      const exerciseById = await this.liveExercises(
        enrollment.states.map((state) => state.exerciseId),
      );
      return EnrollmentService.overlayExercises(day, exerciseById);
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to preview enrollment day`, {
        userId,
        id,
        position,
        error,
      });
      throw new InternalServerErrorException('Failed to preview program day');
    }
  }

  private positionFromDto(
    enrollment: { currentCycle: number },
    dto: PositionDto,
  ): Position {
    return {
      cycle: dto.cycle ?? enrollment.currentCycle,
      weekIndex: dto.weekIndex,
      dayIndex: dto.dayIndex,
    };
  }

  async skipDay(userId: number, id: number, dto: PositionDto, date?: string) {
    this.logger.info(`Skipping enrollment day`, { userId, id, dto });
    try {
      const localDate = this.resolveLocalDate(date);
      const enrollment = await this.ownedEnrollment(userId, id, {
        active: true,
      });
      const snapshot = parseSnapshot(enrollment.snapshot);
      const position = this.positionFromDto(enrollment, dto);
      if (!isValidPosition(snapshot, position)) {
        throw new BadRequestException('Invalid program position');
      }
      const existing = enrollment.dayLogs.find(
        (log) => comparePositions(log, position) === 0,
      );
      if (existing?.status === ProgramDayLogStatus.COMPLETED) {
        throw new ConflictException('Day already completed');
      }
      if (
        existing?.status === ProgramDayLogStatus.STARTED &&
        existing.workout
      ) {
        throw new ConflictException('Day already started');
      }
      const day = resolveDay(snapshot, position, toStateMap(enrollment.states));
      const pointer = this.pointerOf(enrollment);
      const advance = comparePositions(position, pointer) >= 0;
      const next = advance ? this.nextAfter(snapshot, position) : null;

      await this.prismaService.$transaction([
        this.prismaService.programEnrollmentDayLog.upsert({
          where: {
            enrollmentId_cycle_weekIndex_dayIndex: {
              enrollmentId: id,
              ...position,
            },
          },
          create: {
            enrollmentId: id,
            ...position,
            programDayId: day?.dayId ?? 0,
            dayName: day?.dayName ?? '',
            status: ProgramDayLogStatus.SKIPPED,
          },
          update: {
            status: ProgramDayLogStatus.SKIPPED,
            startedAt: null,
            completedAt: null,
          },
        }),
        ...(advance ? [this.pointerUpdate(id, snapshot, next)] : []),
      ]);
      return await this.getEnrollment(userId, id, localDate);
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to skip enrollment day`, {
        userId,
        id,
        dto,
        error,
      });
      throw new InternalServerErrorException('Failed to skip program day');
    }
  }

  private pointerOf(enrollment: {
    currentCycle: number;
    currentWeekIndex: number;
    currentDayIndex: number;
  }): Position {
    return {
      cycle: enrollment.currentCycle,
      weekIndex: enrollment.currentWeekIndex,
      dayIndex: enrollment.currentDayIndex,
    };
  }

  /** Skipping the very last day of a fixed program keeps the pointer there. */
  private nextAfter(
    snapshot: ProgramSnapshot,
    position: Position,
  ): Position | null {
    return nextPosition(snapshot, position);
  }

  private pointerUpdate(
    id: number,
    snapshot: ProgramSnapshot,
    next: Position | null,
  ) {
    return this.prismaService.programEnrollment.update({
      where: { id },
      data: next
        ? {
            currentCycle: next.cycle,
            currentWeekIndex: next.weekIndex,
            currentDayIndex: next.dayIndex,
          }
        : {},
    });
  }

  /** Moves the pointer (SEQUENCE) or shifts the start date (CALENDAR). */
  async setPosition(
    userId: number,
    id: number,
    dto: PositionDto,
    date?: string,
  ) {
    this.logger.info(`Setting enrollment position`, { userId, id, dto, date });
    try {
      const localDate = this.resolveLocalDate(date);
      const enrollment = await this.ownedEnrollment(userId, id, {
        active: true,
      });
      const snapshot = parseSnapshot(enrollment.snapshot);
      const target = this.positionFromDto(enrollment, dto);
      if (!isValidPosition(snapshot, target)) {
        throw new BadRequestException('Invalid program position');
      }

      if (snapshot.scheduleMode === 'CALENDAR') {
        await this.prismaService.programEnrollment.update({
          where: { id },
          data: {
            startDate: new Date(
              `${startDateForWeek(target.weekIndex, localDate)}T00:00:00.000Z`,
            ),
            currentCycle: target.cycle,
            currentWeekIndex: target.weekIndex,
            currentDayIndex: target.dayIndex,
          },
        });
        return await this.getEnrollment(userId, id, localDate);
      }

      const pointer = this.pointerOf(enrollment);
      const passed =
        comparePositions(target, pointer) > 0
          ? [pointer, ...positionsBetween(snapshot, pointer, target)]
          : [];
      const logged = new Set(
        enrollment.dayLogs.map(
          (log) => `${log.cycle}:${log.weekIndex}:${log.dayIndex}`,
        ),
      );
      const toSkip = passed.filter(
        (p) => !logged.has(`${p.cycle}:${p.weekIndex}:${p.dayIndex}`),
      );

      await this.prismaService.$transaction([
        ...toSkip.map((position) => {
          const day = resolveDay(snapshot, position, new Map());
          return this.prismaService.programEnrollmentDayLog.create({
            data: {
              enrollmentId: id,
              ...position,
              programDayId: day?.dayId ?? 0,
              dayName: day?.dayName ?? '',
              status: ProgramDayLogStatus.SKIPPED,
            },
          });
        }),
        this.pointerUpdate(id, snapshot, target),
      ]);
      return await this.getEnrollment(userId, id, localDate);
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to set enrollment position`, {
        userId,
        id,
        dto,
        error,
      });
      throw new InternalServerErrorException(
        'Failed to update program position',
      );
    }
  }

  async updateState(
    userId: number,
    id: number,
    progressionKey: string,
    dto: UpdateEnrollmentStateDto,
  ) {
    this.logger.info(`Updating enrollment state`, {
      userId,
      id,
      progressionKey,
      dto,
    });
    try {
      const enrollment = await this.ownedEnrollment(userId, id, {
        active: true,
      });
      const state = enrollment.states.find(
        (s) => s.progressionKey === progressionKey,
      );
      if (!state) throw new ForbiddenException('Not allowed');
      await this.prismaService.programEnrollmentExerciseState.update({
        where: { id: state.id },
        data: dto,
      });
      return await this.getEnrollment(userId, id);
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to update enrollment state`, {
        userId,
        id,
        progressionKey,
        dto,
        error,
      });
      throw new InternalServerErrorException('Failed to update program state');
    }
  }

  /** Replaces an exercise for the rest of the enrollment; state carries over. */
  async swapExercise(userId: number, id: number, dto: SwapExerciseDto) {
    this.logger.info(`Swapping enrollment exercise`, { userId, id, dto });
    try {
      const enrollment = await this.ownedEnrollment(userId, id, {
        active: true,
      });
      const affected = enrollment.states.filter(
        (s) => s.exerciseId === dto.fromExerciseId,
      );
      if (affected.length === 0) {
        throw new BadRequestException(
          'That exercise is not part of the program',
        );
      }
      const target = await this.prismaService.exercise.findFirst({
        where: {
          id: dto.toExerciseId,
          OR: [{ userId }, { userId: SYSTEM_USER_ID }],
        },
        select: { id: true },
      });
      if (!target) throw new NotFoundException('Exercise not found');
      await this.prismaService.programEnrollmentExerciseState.updateMany({
        where: { enrollmentId: id, exerciseId: dto.fromExerciseId },
        data: { exerciseId: dto.toExerciseId },
      });
      return await this.getEnrollment(userId, id);
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to swap enrollment exercise`, {
        userId,
        id,
        dto,
        error,
      });
      throw new InternalServerErrorException('Failed to swap exercise');
    }
  }

  /** Starts the next cycle of a finished fixed-length program, states kept. */
  async nextCycle(userId: number, id: number) {
    this.logger.info(`Starting next program cycle`, { userId, id });
    try {
      const enrollment = await this.ownedEnrollment(userId, id);
      if (enrollment.status === 'ABANDONED') {
        throw new BadRequestException('This program was abandoned');
      }
      const snapshot = parseSnapshot(enrollment.snapshot);
      const outcome = applyCycleEnd(snapshot, toStateMap(enrollment.states));
      const next = firstPosition(enrollment.currentCycle + 1);
      await this.prismaService.$transaction([
        ...outcome.changedKeys.map((key) =>
          this.prismaService.programEnrollmentExerciseState.upsert(
            stateUpsert(id, outcome.states.get(key)!),
          ),
        ),
        this.prismaService.programEnrollment.update({
          where: { id },
          data: {
            status: 'ACTIVE',
            completedAt: null,
            currentCycle: next.cycle,
            currentWeekIndex: next.weekIndex,
            currentDayIndex: next.dayIndex,
            ...(snapshot.scheduleMode === 'CALENDAR'
              ? {
                  startDate: new Date(
                    `${format(new Date(), 'yyyy-MM-dd')}T00:00:00.000Z`,
                  ),
                }
              : {}),
          },
        }),
      ]);
      return {
        ...(await this.getEnrollment(userId, id)),
        events: outcome.events,
      };
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to start next cycle`, { userId, id, error });
      throw new InternalServerErrorException('Failed to start the next cycle');
    }
  }

  async completeEnrollment(userId: number, id: number) {
    return this.finish(userId, id, 'COMPLETED');
  }

  async abandonEnrollment(userId: number, id: number) {
    return this.finish(userId, id, 'ABANDONED');
  }

  private async finish(
    userId: number,
    id: number,
    status: 'COMPLETED' | 'ABANDONED',
  ) {
    this.logger.info(`Finishing enrollment`, { userId, id, status });
    try {
      await this.ownedEnrollment(userId, id, { active: true });
      await this.prismaService.programEnrollment.update({
        where: { id },
        data: { status, completedAt: new Date() },
      });
      return await this.getEnrollment(userId, id);
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to finish enrollment`, {
        userId,
        id,
        status,
        error,
      });
      throw new InternalServerErrorException('Failed to finish program');
    }
  }

  async deleteEnrollment(userId: number, id: number) {
    this.logger.info(`Deleting enrollment`, { userId, id });
    try {
      const enrollment = await this.ownedEnrollment(userId, id);
      if (enrollment.status === 'ACTIVE') {
        throw new BadRequestException('Abandon the program before deleting it');
      }
      // Workouts keep existing; their program link is set to null.
      return await this.prismaService.programEnrollment.delete({
        where: { id },
        select: ENROLLMENT_SUMMARY_SELECT,
      });
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to delete enrollment`, { userId, id, error });
      throw new InternalServerErrorException('Failed to delete enrollment');
    }
  }

  /** Adherence per week plus main-lift trends from the linked workouts. */
  async getProgress(userId: number, id: number, date?: string) {
    this.logger.info(`Getting enrollment progress`, { userId, id });
    try {
      const localDate = this.resolveLocalDate(date);
      const enrollment = await this.ownedEnrollment(userId, id);
      const snapshot = parseSnapshot(enrollment.snapshot);
      const statesByKey = toStateMap(enrollment.states);
      const schedule = buildScheduleView(
        snapshot,
        enrollment,
        statesByKey,
        enrollment.dayLogs.map((log) => ({
          cycle: log.cycle,
          weekIndex: log.weekIndex,
          dayIndex: log.dayIndex,
          status: log.status,
          workoutId: log.workout?.id ?? null,
          completedAt: log.completedAt,
        })),
        localDate,
      );

      const rows = await this.prismaService.$queryRaw<
        {
          progressionKey: string;
          period: Date;
          topWeight: number;
          e1rm: number;
        }[]
      >(Prisma.sql`
        SELECT we."progressionKey" AS "progressionKey",
               date_trunc('week', w."startedAt")::date AS period,
               MAX(ws.weight)::float AS "topWeight",
               MAX(CASE WHEN ws.reps = 1 THEN ws.weight ELSE ws.weight * (1 + ws.reps / 30.0) END)::float AS e1rm
        FROM "WorkoutSet" ws
        JOIN "WorkoutExercise" we ON we.id = ws."workoutExerciseId"
        JOIN "Workout" w ON w.id = we."workoutId"
        JOIN "ProgramEnrollmentDayLog" l ON l.id = w."programDayLogId"
        WHERE l."enrollmentId" = ${id}
          AND w."userId" = ${userId}
          AND w.status = 'COMPLETED'
          AND ws.completed = true
          AND ws.type <> 'warmup'
          AND ws.weight > 0
          AND ws.reps > 0
          AND we."progressionKey" IS NOT NULL
        GROUP BY we."progressionKey", period
        ORDER BY we."progressionKey", period
      `);

      const names = new Map<string, string>();
      for (const block of snapshot.blocks) {
        for (const day of block.days) {
          for (const exercise of day.exercises) {
            if (!names.has(exercise.progressionKey)) {
              names.set(exercise.progressionKey, exercise.exercise.name);
            }
          }
        }
      }
      const lifts = new Map<
        string,
        {
          progressionKey: string;
          exerciseName: string;
          current: unknown;
          points: unknown[];
        }
      >();
      for (const row of rows) {
        const state = statesByKey.get(row.progressionKey);
        let lift = lifts.get(row.progressionKey);
        if (!lift) {
          lift = {
            progressionKey: row.progressionKey,
            exerciseName: names.get(row.progressionKey) ?? row.progressionKey,
            current: state
              ? {
                  workingWeight: state.workingWeight,
                  trainingMax: state.trainingMax,
                  e1rm: state.e1rm,
                }
              : null,
            points: [],
          };
          lifts.set(row.progressionKey, lift);
        }
        lift.points.push({
          period: format(row.period, 'yyyy-MM-dd'),
          topWeight: row.topWeight,
          e1rm: Number(row.e1rm.toFixed(2)),
        });
      }

      return {
        enrollmentId: id,
        adherence: schedule.adherence,
        weeks: schedule.weeks.map((week) => ({
          weekIndex: week.weekIndex,
          blockName: week.blockName,
          isDeload: week.isDeload,
          planned: week.days.length,
          completed: week.days.filter((d) => d.status === 'COMPLETED').length,
          skipped: week.days.filter((d) => d.status === 'SKIPPED').length,
          missed: week.days.filter((d) => d.status === 'MISSED').length,
        })),
        lifts: [...lifts.values()],
      };
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to get enrollment progress`, {
        userId,
        id,
        error,
      });
      throw new InternalServerErrorException('Failed to get program progress');
    }
  }
}
