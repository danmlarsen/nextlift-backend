import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  Prisma,
  ProgramGoal,
  ProgramLevel,
  ProgramVisibility,
} from '@prisma/client';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
  MAX_PROGRAMS_PER_USER,
  PROGRAM_LIST_LIMIT,
} from 'src/common/constants';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  FULL_PROGRAM_INCLUDE,
  PROGRAM_SUMMARY_INCLUDE,
  ProgramSummaryRow,
  ProgramWithTree,
} from './const/full-program-include';
import { CreateProgramDto } from './dtos/create-program.dto';
import { UpdateProgramDto } from './dtos/update-program.dto';
import { withOwnership } from './utils/ownership';

export type ProgramScope = 'system' | 'mine';

export type ListProgramsOptions = {
  scope: ProgramScope;
  goal?: ProgramGoal;
  level?: ProgramLevel;
  daysPerWeek?: number;
  cursor?: number;
};

const COPY_NAME_MAX = 60;

@Injectable()
export class ProgramManagementService {
  constructor(
    private readonly prismaService: PrismaService,
    @InjectPinoLogger(ProgramManagementService.name)
    private readonly logger: PinoLogger,
  ) {}

  /** Programs the user may read: their own and the curated library. */
  static readableWhere(userId: number, id?: number): Prisma.ProgramWhereInput {
    return {
      ...(id !== undefined ? { id } : {}),
      OR: [{ userId }, { visibility: ProgramVisibility.SYSTEM }],
    };
  }

  private toSummary(row: ProgramSummaryRow, userId: number) {
    const { blocks, ...program } = row;
    return {
      ...withOwnership(program, userId),
      totalWeeks: blocks.reduce((sum, block) => sum + block._count.weeks, 0),
    };
  }

  private async ensureCapacity(userId: number) {
    const count = await this.prismaService.program.count({ where: { userId } });
    if (count >= MAX_PROGRAMS_PER_USER) {
      this.logger.warn(`User reached the program limit`, { userId });
      throw new BadRequestException('Program limit reached');
    }
  }

  private async ensureOwned(userId: number, id: number) {
    const program = await this.prismaService.program.findFirst({
      where: { id, userId, visibility: ProgramVisibility.PRIVATE },
    });
    if (!program) {
      this.logger.warn(
        `User tried to modify a program that does not exist or they do not own`,
        { userId, id },
      );
      throw new ForbiddenException('Not allowed');
    }
    return program;
  }

  async listPrograms(userId: number, options: ListProgramsOptions) {
    this.logger.info(`Listing programs`, { userId, options });
    try {
      const where: Prisma.ProgramWhereInput =
        options.scope === 'mine'
          ? { userId }
          : { visibility: ProgramVisibility.SYSTEM };
      if (options.goal) where.goal = options.goal;
      if (options.level) where.level = options.level;
      if (options.daysPerWeek) where.daysPerWeek = options.daysPerWeek;

      const orderBy: Prisma.ProgramOrderByWithRelationInput[] =
        options.scope === 'mine'
          ? [{ updatedAt: 'desc' }, { id: 'desc' }]
          : [{ level: 'asc' }, { id: 'asc' }];

      const rows = await this.prismaService.program.findMany({
        where,
        orderBy,
        take: PROGRAM_LIST_LIMIT + 1,
        ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
        include: PROGRAM_SUMMARY_INCLUDE,
      });

      const hasNextPage = rows.length > PROGRAM_LIST_LIMIT;
      const page = hasNextPage ? rows.slice(0, PROGRAM_LIST_LIMIT) : rows;
      return {
        success: true,
        meta: {
          hasNextPage,
          nextCursor: hasNextPage ? page[page.length - 1].id : null,
        },
        data: page.map((row) => this.toSummary(row, userId)),
      };
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to list programs`, { userId, options, error });
      throw new InternalServerErrorException('Failed to list programs');
    }
  }

  async getProgram(userId: number, id: number) {
    this.logger.info(`Getting program`, { userId, id });
    try {
      const program = await this.prismaService.program.findFirst({
        where: ProgramManagementService.readableWhere(userId, id),
        include: FULL_PROGRAM_INCLUDE,
      });
      if (!program) {
        this.logger.warn(
          `User tried to get a program that does not exist or they cannot read`,
          { userId, id },
        );
        throw new ForbiddenException('Not allowed');
      }
      return withOwnership(program, userId);
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to get program`, { userId, id, error });
      throw new InternalServerErrorException('Failed to get program');
    }
  }

  async createProgram(userId: number, data: CreateProgramDto) {
    this.logger.info(`Creating program`, { userId, data });
    try {
      await this.ensureCapacity(userId);
      const program = await this.prismaService.program.create({
        data: {
          ...data,
          userId,
          // Every program starts with one week so days can be added at once.
          blocks: {
            create: [
              {
                blockOrder: 1,
                name: 'Block 1',
                weeks: { create: [{ weekInBlock: 1 }] },
              },
            ],
          },
        },
        include: FULL_PROGRAM_INCLUDE,
      });
      return withOwnership(program, userId);
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to create program`, { userId, data, error });
      throw new InternalServerErrorException('Failed to create program');
    }
  }

  async updateProgram(userId: number, id: number, data: UpdateProgramDto) {
    this.logger.info(`Updating program`, { userId, id, data });
    try {
      await this.ensureOwned(userId, id);
      const program = await this.prismaService.program.update({
        where: { id },
        data,
        include: FULL_PROGRAM_INCLUDE,
      });
      return withOwnership(program, userId);
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to update program`, {
        userId,
        id,
        data,
        error,
      });
      throw new InternalServerErrorException('Failed to update program');
    }
  }

  async deleteProgram(userId: number, id: number) {
    this.logger.info(`Deleting program`, { userId, id });
    try {
      await this.ensureOwned(userId, id);
      // Enrollments keep their snapshot; the FK is set to null by the schema.
      return await this.prismaService.program.delete({ where: { id } });
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to delete program`, { userId, id, error });
      throw new InternalServerErrorException('Failed to delete program');
    }
  }

  /** Copies any readable program (curated included) into the user's library. */
  async duplicateProgram(userId: number, id: number) {
    this.logger.info(`Duplicating program`, { userId, id });
    try {
      const source = await this.prismaService.program.findFirst({
        where: ProgramManagementService.readableWhere(userId, id),
        include: FULL_PROGRAM_INCLUDE,
      });
      if (!source) {
        this.logger.warn(
          `User tried to duplicate a program that does not exist or they cannot read`,
          { userId, id },
        );
        throw new ForbiddenException('Not allowed');
      }
      await this.ensureCapacity(userId);

      const program = await this.prismaService.program.create({
        data: {
          userId,
          name: `Copy of ${source.name}`.slice(0, COPY_NAME_MAX),
          description: source.description,
          credit: source.credit,
          goal: source.goal,
          level: source.level,
          scheduleMode: source.scheduleMode,
          durationMode: source.durationMode,
          daysPerWeek: source.daysPerWeek,
          effortScale: source.effortScale,
          visibility: ProgramVisibility.PRIVATE,
          blocks: { create: ProgramManagementService.copyBlocks(source) },
        },
        include: FULL_PROGRAM_INCLUDE,
      });
      return withOwnership(program, userId);
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Failed to duplicate program`, { userId, id, error });
      throw new InternalServerErrorException('Failed to duplicate program');
    }
  }

  /** Nested create input reproducing a program's whole tree. */
  static copyBlocks(
    source: ProgramWithTree,
  ): Prisma.ProgramBlockCreateWithoutProgramInput[] {
    return source.blocks.map((block, blockIndex) =>
      ProgramManagementService.copyBlock(block, blockIndex + 1),
    );
  }

  static copyBlock(
    block: ProgramWithTree['blocks'][number],
    blockOrder: number,
    name: string = block.name,
  ): Prisma.ProgramBlockCreateWithoutProgramInput {
    return {
      blockOrder,
      name,
      focus: block.focus,
      weeks: {
        create: block.weeks.map((week) => ({
          weekInBlock: week.weekInBlock,
          label: week.label,
          isDeload: week.isDeload,
          volumeMultiplier: week.volumeMultiplier,
          intensityMultiplier: week.intensityMultiplier,
        })),
      },
      days: {
        create: block.days.map((day, dayIndex) => ({
          dayOrder: dayIndex + 1,
          name: day.name,
          weekday: day.weekday,
          notes: day.notes,
          exercises: {
            create: day.exercises.map((exercise, exerciseIndex) => ({
              exerciseId: exercise.exerciseId,
              exerciseOrder: exerciseIndex + 1,
              progressionKey: exercise.progressionKey,
              strategy: exercise.strategy,
              progression:
                exercise.progression === null
                  ? Prisma.DbNull
                  : (exercise.progression as Prisma.InputJsonValue),
              roundingKg: exercise.roundingKg,
              restSeconds: exercise.restSeconds,
              notes: exercise.notes,
              sets: {
                create: exercise.sets.map((set) => ({
                  weekInBlock: set.weekInBlock,
                  setOrder: set.setOrder,
                  type: set.type,
                  repsMin: set.repsMin,
                  repsMax: set.repsMax,
                  isAmrap: set.isAmrap,
                  percent: set.percent,
                  weight: set.weight,
                  targetRpe: set.targetRpe,
                  restSeconds: set.restSeconds,
                  duration: set.duration,
                  notes: set.notes,
                })),
              },
            })),
          },
        })),
      },
    };
  }
}
