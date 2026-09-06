import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProgramVisibility, ProgressionStrategy } from '@prisma/client';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
  MAX_DAYS_PER_BLOCK,
  MAX_EXERCISES_PER_PROGRAM_DAY,
  MAX_PROGRAM_BLOCKS,
  SYSTEM_USER_ID,
} from 'src/common/constants';
import { PrismaService } from 'src/prisma/prisma.service';
import { FULL_PROGRAM_INCLUDE } from './const/full-program-include';
import {
  ProgramExerciseInputDto,
  ProgramSetInputDto,
  PutDayContentDto,
} from './dtos/day-content.dto';
import {
  CreateProgramBlockDto,
  UpdateProgramBlockDto,
  UpdateProgramWeekDto,
} from './dtos/program-block.dto';
import {
  CreateProgramDayDto,
  ImportDayFromTemplateDto,
  UpdateProgramDayDto,
} from './dtos/program-day.dto';
import { ProgramManagementService } from './program-management.service';
import { withOwnership } from './utils/ownership';

type Tx = Prisma.TransactionClient;

/** Default key: the same exercise shares state wherever it appears. */
export function defaultProgressionKey(exerciseId: number): string {
  return `ex-${exerciseId}`;
}

@Injectable()
export class ProgramStructureService {
  constructor(
    private readonly prismaService: PrismaService,
    @InjectPinoLogger(ProgramStructureService.name)
    private readonly logger: PinoLogger,
  ) {}

  private async ownedProgram(userId: number, programId: number) {
    const program = await this.prismaService.program.findFirst({
      where: { id: programId, userId, visibility: ProgramVisibility.PRIVATE },
    });
    if (!program) {
      this.logger.warn(
        `User tried to modify a program that does not exist or they do not own`,
        { userId, programId },
      );
      throw new ForbiddenException('Not allowed');
    }
    return program;
  }

  private async ownedBlock(userId: number, programId: number, blockId: number) {
    await this.ownedProgram(userId, programId);
    const block = await this.prismaService.programBlock.findFirst({
      where: { id: blockId, programId },
    });
    if (!block) {
      this.logger.warn(`Block not found in program`, {
        userId,
        programId,
        blockId,
      });
      throw new ForbiddenException('Not allowed');
    }
    return block;
  }

  private async ownedDay(userId: number, programId: number, dayId: number) {
    await this.ownedProgram(userId, programId);
    const day = await this.prismaService.programDay.findFirst({
      where: { id: dayId, block: { programId } },
    });
    if (!day) {
      this.logger.warn(`Day not found in program`, {
        userId,
        programId,
        dayId,
      });
      throw new ForbiddenException('Not allowed');
    }
    return day;
  }

  private async fullProgram(userId: number, programId: number) {
    const program = await this.prismaService.program.findUniqueOrThrow({
      where: { id: programId },
      include: FULL_PROGRAM_INCLUDE,
    });
    return withOwnership(program, userId);
  }

  private static weekRows(from: number, to: number) {
    return Array.from({ length: to - from + 1 }, (_, index) => ({
      weekInBlock: from + index,
    }));
  }

  // --- Blocks ----------------------------------------------------------------

  async createBlock(
    userId: number,
    programId: number,
    data: CreateProgramBlockDto,
  ) {
    this.logger.info(`Creating program block`, { userId, programId, data });
    try {
      await this.ownedProgram(userId, programId);
      const count = await this.prismaService.programBlock.count({
        where: { programId },
      });
      if (count >= MAX_PROGRAM_BLOCKS) {
        throw new BadRequestException('Block limit reached');
      }
      await this.prismaService.programBlock.create({
        data: {
          programId,
          blockOrder: count + 1,
          name: data.name,
          focus: data.focus ?? null,
          weeks: {
            create: ProgramStructureService.weekRows(1, data.weeks ?? 1),
          },
        },
      });
      return await this.fullProgram(userId, programId);
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to create program block`, {
        userId,
        programId,
        data,
        error,
      });
      throw new InternalServerErrorException('Failed to create program block');
    }
  }

  async updateBlock(
    userId: number,
    programId: number,
    blockId: number,
    data: UpdateProgramBlockDto,
  ) {
    this.logger.info(`Updating program block`, {
      userId,
      programId,
      blockId,
      data,
    });
    try {
      const block = await this.ownedBlock(userId, programId, blockId);
      await this.prismaService.$transaction(async (tx) => {
        await tx.programBlock.update({
          where: { id: blockId },
          data: {
            ...(data.name !== undefined ? { name: data.name } : {}),
            ...(data.focus !== undefined ? { focus: data.focus } : {}),
          },
        });
        if (data.weeks !== undefined) {
          await this.resizeBlockWeeks(tx, blockId, data.weeks);
        }
        if (
          data.blockOrder !== undefined &&
          data.blockOrder !== block.blockOrder
        ) {
          await this.reorderBlocks(tx, programId, blockId, data.blockOrder);
        }
      });
      return await this.fullProgram(userId, programId);
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to update program block`, {
        userId,
        programId,
        blockId,
        data,
        error,
      });
      throw new InternalServerErrorException('Failed to update program block');
    }
  }

  private async resizeBlockWeeks(tx: Tx, blockId: number, weeks: number) {
    const current = await tx.programWeek.count({ where: { blockId } });
    if (weeks < current) {
      await tx.programWeek.deleteMany({
        where: { blockId, weekInBlock: { gt: weeks } },
      });
      // Week-scoped set rows for removed weeks would never be reachable again.
      await tx.programSet.deleteMany({
        where: {
          weekInBlock: { gt: weeks },
          programExercise: { day: { blockId } },
        },
      });
    } else if (weeks > current) {
      await tx.programWeek.createMany({
        data: ProgramStructureService.weekRows(current + 1, weeks).map(
          (row) => ({
            ...row,
            blockId,
          }),
        ),
      });
    }
  }

  private async reorderBlocks(
    tx: Tx,
    programId: number,
    blockId: number,
    target: number,
  ) {
    const blocks = await tx.programBlock.findMany({
      where: { programId },
      orderBy: { blockOrder: 'asc' },
      select: { id: true },
    });
    const ids = blocks.map((b) => b.id).filter((id) => id !== blockId);
    ids.splice(Math.min(Math.max(target, 1), ids.length + 1) - 1, 0, blockId);
    await this.renumber(tx, 'block', ids);
  }

  private async renumber(tx: Tx, kind: 'block' | 'day', ids: number[]) {
    // Two passes avoid transient unique/ordering collisions on renumbering.
    for (const [index, id] of ids.entries()) {
      if (kind === 'block') {
        await tx.programBlock.update({
          where: { id },
          data: { blockOrder: -(index + 1) },
        });
      } else {
        await tx.programDay.update({
          where: { id },
          data: { dayOrder: -(index + 1) },
        });
      }
    }
    for (const [index, id] of ids.entries()) {
      if (kind === 'block') {
        await tx.programBlock.update({
          where: { id },
          data: { blockOrder: index + 1 },
        });
      } else {
        await tx.programDay.update({
          where: { id },
          data: { dayOrder: index + 1 },
        });
      }
    }
  }

  async deleteBlock(userId: number, programId: number, blockId: number) {
    this.logger.info(`Deleting program block`, { userId, programId, blockId });
    try {
      await this.ownedBlock(userId, programId, blockId);
      const count = await this.prismaService.programBlock.count({
        where: { programId },
      });
      if (count <= 1) {
        throw new BadRequestException('A program needs at least one block');
      }
      await this.prismaService.$transaction(async (tx) => {
        await tx.programBlock.delete({ where: { id: blockId } });
        const remaining = await tx.programBlock.findMany({
          where: { programId },
          orderBy: { blockOrder: 'asc' },
          select: { id: true },
        });
        await this.renumber(
          tx,
          'block',
          remaining.map((b) => b.id),
        );
      });
      return await this.fullProgram(userId, programId);
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to delete program block`, {
        userId,
        programId,
        blockId,
        error,
      });
      throw new InternalServerErrorException('Failed to delete program block');
    }
  }

  async duplicateBlock(userId: number, programId: number, blockId: number) {
    this.logger.info(`Duplicating program block`, {
      userId,
      programId,
      blockId,
    });
    try {
      await this.ownedBlock(userId, programId, blockId);
      const program = await this.prismaService.program.findUniqueOrThrow({
        where: { id: programId },
        include: FULL_PROGRAM_INCLUDE,
      });
      if (program.blocks.length >= MAX_PROGRAM_BLOCKS) {
        throw new BadRequestException('Block limit reached');
      }
      const source = program.blocks.find((b) => b.id === blockId)!;
      await this.prismaService.programBlock.create({
        data: {
          programId,
          ...ProgramManagementService.copyBlock(
            source,
            program.blocks.length + 1,
            `${source.name} (copy)`.slice(0, 50),
          ),
        },
      });
      return await this.fullProgram(userId, programId);
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to duplicate program block`, {
        userId,
        programId,
        blockId,
        error,
      });
      throw new InternalServerErrorException(
        'Failed to duplicate program block',
      );
    }
  }

  async updateWeek(
    userId: number,
    programId: number,
    blockId: number,
    weekInBlock: number,
    data: UpdateProgramWeekDto,
  ) {
    this.logger.info(`Updating program week`, {
      userId,
      programId,
      blockId,
      weekInBlock,
      data,
    });
    try {
      await this.ownedBlock(userId, programId, blockId);
      const week = await this.prismaService.programWeek.findUnique({
        where: { blockId_weekInBlock: { blockId, weekInBlock } },
      });
      if (!week) throw new ForbiddenException('Not allowed');
      await this.prismaService.programWeek.update({
        where: { id: week.id },
        data,
      });
      return await this.fullProgram(userId, programId);
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to update program week`, {
        userId,
        programId,
        blockId,
        weekInBlock,
        data,
        error,
      });
      throw new InternalServerErrorException('Failed to update program week');
    }
  }

  // --- Days ------------------------------------------------------------------

  async createDay(
    userId: number,
    programId: number,
    blockId: number,
    data: CreateProgramDayDto,
  ) {
    this.logger.info(`Creating program day`, {
      userId,
      programId,
      blockId,
      data,
    });
    try {
      await this.ownedBlock(userId, programId, blockId);
      const count = await this.prismaService.programDay.count({
        where: { blockId },
      });
      if (count >= MAX_DAYS_PER_BLOCK) {
        throw new BadRequestException('Day limit reached');
      }
      await this.prismaService.programDay.create({
        data: {
          blockId,
          dayOrder: count + 1,
          name: data.name,
          weekday: data.weekday ?? null,
          notes: data.notes ?? null,
        },
      });
      return await this.fullProgram(userId, programId);
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to create program day`, {
        userId,
        programId,
        blockId,
        data,
        error,
      });
      throw new InternalServerErrorException('Failed to create program day');
    }
  }

  async updateDay(
    userId: number,
    programId: number,
    dayId: number,
    data: UpdateProgramDayDto,
  ) {
    this.logger.info(`Updating program day`, {
      userId,
      programId,
      dayId,
      data,
    });
    try {
      const day = await this.ownedDay(userId, programId, dayId);
      const { dayOrder, ...fields } = data;
      await this.prismaService.$transaction(async (tx) => {
        await tx.programDay.update({ where: { id: dayId }, data: fields });
        if (dayOrder !== undefined && dayOrder !== day.dayOrder) {
          const days = await tx.programDay.findMany({
            where: { blockId: day.blockId },
            orderBy: { dayOrder: 'asc' },
            select: { id: true },
          });
          const ids = days.map((d) => d.id).filter((id) => id !== dayId);
          ids.splice(
            Math.min(Math.max(dayOrder, 1), ids.length + 1) - 1,
            0,
            dayId,
          );
          await this.renumber(tx, 'day', ids);
        }
      });
      return await this.fullProgram(userId, programId);
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to update program day`, {
        userId,
        programId,
        dayId,
        data,
        error,
      });
      throw new InternalServerErrorException('Failed to update program day');
    }
  }

  async deleteDay(userId: number, programId: number, dayId: number) {
    this.logger.info(`Deleting program day`, { userId, programId, dayId });
    try {
      const day = await this.ownedDay(userId, programId, dayId);
      await this.prismaService.$transaction(async (tx) => {
        await tx.programDay.delete({ where: { id: dayId } });
        const remaining = await tx.programDay.findMany({
          where: { blockId: day.blockId },
          orderBy: { dayOrder: 'asc' },
          select: { id: true },
        });
        await this.renumber(
          tx,
          'day',
          remaining.map((d) => d.id),
        );
      });
      return await this.fullProgram(userId, programId);
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to delete program day`, {
        userId,
        programId,
        dayId,
        error,
      });
      throw new InternalServerErrorException('Failed to delete program day');
    }
  }

  // --- Day content -----------------------------------------------------------

  /** Replaces every exercise and set of a day in one transaction. */
  async putDayContent(
    userId: number,
    programId: number,
    dayId: number,
    data: PutDayContentDto,
  ) {
    this.logger.info(`Replacing program day content`, {
      userId,
      programId,
      dayId,
      exercises: data.exercises.length,
    });
    try {
      await this.ownedDay(userId, programId, dayId);
      const exercises = data.exercises.map((exercise) => ({
        ...exercise,
        progressionKey:
          exercise.progressionKey ?? defaultProgressionKey(exercise.exerciseId),
      }));

      await this.ensureExercisesAvailable(
        userId,
        exercises.map((e) => e.exerciseId),
      );
      ProgramStructureService.validateExerciseInputs(exercises);
      await this.ensureKeysConsistent(programId, dayId, exercises);

      await this.prismaService.$transaction(async (tx) => {
        await tx.programExercise.deleteMany({ where: { dayId } });
        await tx.programDay.update({
          where: { id: dayId },
          data: {
            exercises: {
              create: exercises.map((exercise, index) =>
                ProgramStructureService.toExerciseCreate(exercise, index + 1),
              ),
            },
          },
        });
      });
      return await this.fullProgram(userId, programId);
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to replace program day content`, {
        userId,
        programId,
        dayId,
        error,
      });
      throw new InternalServerErrorException(
        'Failed to update program day content',
      );
    }
  }

  private async ensureExercisesAvailable(
    userId: number,
    exerciseIds: number[],
  ) {
    const unique = [...new Set(exerciseIds)];
    if (unique.length === 0) return;
    const found = await this.prismaService.exercise.findMany({
      where: {
        id: { in: unique },
        OR: [{ userId }, { userId: SYSTEM_USER_ID }],
      },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      this.logger.warn(`Program day references unavailable exercises`, {
        userId,
        exerciseIds: unique,
      });
      throw new NotFoundException('Exercise not found');
    }
  }

  static validateExerciseInputs(
    exercises: (ProgramExerciseInputDto & { progressionKey: string })[],
  ) {
    for (const exercise of exercises) {
      const params = exercise.progression ?? null;
      if (exercise.strategy !== ProgressionStrategy.NONE) {
        if (!params || params.strategy !== exercise.strategy) {
          throw new BadRequestException(
            `Progression settings for ${exercise.progressionKey} do not match the ${exercise.strategy} strategy`,
          );
        }
      } else if (params && params.strategy !== 'NONE') {
        throw new BadRequestException(
          `Progression settings for ${exercise.progressionKey} belong to another strategy`,
        );
      }
      for (const set of exercise.sets) {
        if (
          set.repsMin != null &&
          set.repsMax != null &&
          set.repsMax < set.repsMin
        ) {
          throw new BadRequestException(
            'repsMax must not be lower than repsMin',
          );
        }
      }
    }
    const byKey = new Map<
      string,
      { exerciseId: number; strategy: ProgressionStrategy }
    >();
    for (const exercise of exercises) {
      const known = byKey.get(exercise.progressionKey);
      if (known && known.exerciseId !== exercise.exerciseId) {
        throw new BadRequestException(
          `Progression key ${exercise.progressionKey} is used by two different exercises`,
        );
      }
      if (
        known &&
        known.strategy !== 'NONE' &&
        exercise.strategy !== 'NONE' &&
        known.strategy !== exercise.strategy
      ) {
        throw new BadRequestException(
          `Progression key ${exercise.progressionKey} mixes progression strategies`,
        );
      }
      if (!known || known.strategy === 'NONE') {
        byKey.set(exercise.progressionKey, {
          exerciseId: exercise.exerciseId,
          strategy: exercise.strategy,
        });
      }
    }
  }

  private async ensureKeysConsistent(
    programId: number,
    dayId: number,
    exercises: (ProgramExerciseInputDto & { progressionKey: string })[],
  ) {
    const keys = [...new Set(exercises.map((e) => e.progressionKey))];
    if (keys.length === 0) return;
    const others = await this.prismaService.programExercise.findMany({
      where: {
        progressionKey: { in: keys },
        day: { id: { not: dayId }, block: { programId } },
      },
      select: { progressionKey: true, exerciseId: true, strategy: true },
    });
    for (const exercise of exercises) {
      for (const other of others.filter(
        (o) => o.progressionKey === exercise.progressionKey,
      )) {
        if (other.exerciseId !== exercise.exerciseId) {
          throw new BadRequestException(
            `Progression key ${exercise.progressionKey} is already used by another exercise in this program`,
          );
        }
        if (
          other.strategy !== 'NONE' &&
          exercise.strategy !== 'NONE' &&
          other.strategy !== exercise.strategy
        ) {
          throw new BadRequestException(
            `Progression key ${exercise.progressionKey} uses ${other.strategy} elsewhere in this program`,
          );
        }
      }
    }
  }

  /** Set rows keep their input order inside each week scope. */
  static normalizeSets(
    sets: ProgramSetInputDto[],
  ): Prisma.ProgramSetCreateWithoutProgramExerciseInput[] {
    const counters = new Map<number | null, number>();
    return sets.map((set) => {
      const scope = set.weekInBlock ?? null;
      const order = (counters.get(scope) ?? 0) + 1;
      counters.set(scope, order);
      return {
        weekInBlock: scope,
        setOrder: order,
        type: set.type ?? 'normal',
        repsMin: set.repsMin ?? null,
        repsMax: set.repsMax ?? set.repsMin ?? null,
        isAmrap: set.isAmrap ?? false,
        percent: set.percent ?? null,
        weight: set.weight ?? null,
        targetRpe: set.targetRpe ?? null,
        restSeconds: set.restSeconds ?? null,
        duration: set.duration ?? null,
        notes: set.notes ?? null,
      };
    });
  }

  static toExerciseCreate(
    exercise: ProgramExerciseInputDto & { progressionKey: string },
    exerciseOrder: number,
  ): Prisma.ProgramExerciseCreateWithoutDayInput {
    return {
      exercise: { connect: { id: exercise.exerciseId } },
      exerciseOrder,
      progressionKey: exercise.progressionKey,
      strategy: exercise.strategy,
      progression: exercise.progression
        ? (exercise.progression as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull,
      roundingKg: exercise.roundingKg ?? null,
      restSeconds: exercise.restSeconds ?? null,
      notes: exercise.notes ?? null,
      sets: { create: ProgramStructureService.normalizeSets(exercise.sets) },
    };
  }

  /** Appends a template's exercises to a day as fixed prescriptions. */
  async importDayFromTemplate(
    userId: number,
    programId: number,
    dayId: number,
    data: ImportDayFromTemplateDto,
  ) {
    this.logger.info(`Importing template into program day`, {
      userId,
      programId,
      dayId,
      data,
    });
    try {
      await this.ownedDay(userId, programId, dayId);
      const template = await this.prismaService.workoutTemplate.findFirst({
        where: { id: data.templateId, userId },
        include: {
          workoutTemplateExercises: {
            orderBy: { exerciseOrder: 'asc' },
            include: {
              workoutTemplateSets: {
                orderBy: [{ setNumber: 'asc' }, { createdAt: 'asc' }],
              },
            },
          },
        },
      });
      if (!template) {
        this.logger.warn(`Template not found or not owned`, {
          userId,
          templateId: data.templateId,
        });
        throw new ForbiddenException('Not allowed');
      }
      const existing = await this.prismaService.programExercise.count({
        where: { dayId },
      });
      if (
        existing + template.workoutTemplateExercises.length >
        MAX_EXERCISES_PER_PROGRAM_DAY
      ) {
        throw new BadRequestException('Exercise limit reached for this day');
      }

      await this.prismaService.programDay.update({
        where: { id: dayId },
        data: {
          exercises: {
            create: template.workoutTemplateExercises.map(
              (templateExercise, index) => ({
                exercise: { connect: { id: templateExercise.exerciseId } },
                exerciseOrder: existing + index + 1,
                progressionKey: defaultProgressionKey(
                  templateExercise.exerciseId,
                ),
                strategy: ProgressionStrategy.NONE,
                progression: { strategy: 'NONE', basis: 'FIXED' },
                notes: templateExercise.notes,
                sets: {
                  create: templateExercise.workoutTemplateSets.map(
                    (set, setIndex) => ({
                      setOrder: setIndex + 1,
                      type: set.type,
                      repsMin: set.reps,
                      repsMax: set.reps,
                      weight: set.weight,
                      duration: set.duration,
                      notes: set.notes,
                    }),
                  ),
                },
              }),
            ),
          },
        },
      });
      return await this.fullProgram(userId, programId);
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to import template into program day`, {
        userId,
        programId,
        dayId,
        data,
        error,
      });
      throw new InternalServerErrorException('Failed to import template');
    }
  }
}
