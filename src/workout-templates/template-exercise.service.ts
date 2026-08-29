import {
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { FULL_TEMPLATE_INCLUDE } from './const/full-template-include';
import { CreateTemplateExerciseDto } from './dtos/create-template-exercise.dto';
import { UpdateTemplateExerciseDto } from './dtos/update-template-exercise.dto';
import { SYSTEM_USER_ID } from 'src/common/constants';

@Injectable()
export class TemplateExerciseService {
  constructor(
    private readonly prismaService: PrismaService,
    @InjectPinoLogger(TemplateExerciseService.name)
    private readonly logger: PinoLogger,
  ) {}

  async createTemplateExercise(
    userId: number,
    workoutTemplateId: number,
    data: CreateTemplateExerciseDto,
  ) {
    this.logger.info(`Creating template exercise`, {
      userId,
      workoutTemplateId,
      data,
    });
    try {
      const [template, exercise] = await Promise.all([
        this.prismaService.workoutTemplate.findFirst({
          where: { id: workoutTemplateId, userId },
        }),
        this.prismaService.exercise.findFirst({
          where: {
            id: data.exerciseId,
            OR: [{ userId }, { userId: SYSTEM_USER_ID }],
          },
          select: { id: true },
        }),
      ]);

      if (!template || !exercise) {
        this.logger.warn(
          `User tried to add an unavailable exercise or modify a template they do not own`,
          { userId, workoutTemplateId, exerciseId: data.exerciseId },
        );
        throw new ForbiddenException('Not allowed');
      }

      const maxOrder: { _max: { exerciseOrder: number | null } } =
        await this.prismaService.workoutTemplateExercise.aggregate({
          where: { workoutTemplateId },
          _max: { exerciseOrder: true },
        });

      const nextOrder = (maxOrder._max.exerciseOrder ?? 0) + 1;

      return await this.prismaService.workoutTemplate.update({
        where: { id: workoutTemplateId },
        data: {
          workoutTemplateExercises: {
            create: {
              exerciseId: data.exerciseId,
              exerciseOrder: nextOrder,
              workoutTemplateSets: {
                create: [{ setNumber: 1 }],
              },
            },
          },
        },
        include: FULL_TEMPLATE_INCLUDE,
      });
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to create template exercise`, {
        userId,
        workoutTemplateId,
        data,
        error,
      });
      throw new InternalServerErrorException(
        'Failed to create template exercise',
      );
    }
  }

  async updateTemplateExercise(
    userId: number,
    id: number,
    data: UpdateTemplateExerciseDto,
  ) {
    this.logger.info(`Updating template exercise`, { userId, id, data });
    try {
      const templateExercise =
        await this.prismaService.workoutTemplateExercise.findUnique({
          where: { id },
          include: {
            workoutTemplate: true,
          },
        });

      if (
        !templateExercise ||
        templateExercise.workoutTemplate.userId !== userId
      ) {
        this.logger.warn(
          `User tried to update a template exercise that does not exist or they do not own`,
          { userId, id },
        );
        throw new ForbiddenException('Not allowed');
      }

      return await this.prismaService.workoutTemplate.update({
        where: { id: templateExercise.workoutTemplateId },
        data: {
          workoutTemplateExercises: {
            update: {
              where: { id },
              data,
            },
          },
        },
        include: FULL_TEMPLATE_INCLUDE,
      });
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to update template exercise`, {
        userId,
        id,
        data,
        error,
      });
      throw new InternalServerErrorException(
        'Failed to update template exercise',
      );
    }
  }

  async deleteTemplateExercise(userId: number, id: number) {
    this.logger.info(`Deleting template exercise`, { userId, id });
    try {
      const templateExercise =
        await this.prismaService.workoutTemplateExercise.findUnique({
          where: { id },
          include: {
            workoutTemplate: true,
          },
        });

      if (
        !templateExercise ||
        templateExercise.workoutTemplate.userId !== userId
      ) {
        this.logger.warn(
          `User tried to delete a template exercise that does not exist or they do not own`,
          { userId, id },
        );
        throw new ForbiddenException('Not allowed');
      }

      return await this.prismaService.workoutTemplate.update({
        where: { id: templateExercise.workoutTemplateId },
        data: {
          workoutTemplateExercises: {
            delete: { id },
          },
        },
        include: FULL_TEMPLATE_INCLUDE,
      });
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to delete template exercise`, {
        userId,
        id,
        error,
      });
      throw new InternalServerErrorException(
        'Failed to delete template exercise',
      );
    }
  }
}
