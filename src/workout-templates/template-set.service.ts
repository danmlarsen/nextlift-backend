import {
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { FULL_TEMPLATE_INCLUDE } from './const/full-template-include';
import { CreateTemplateSetDto } from './dtos/create-template-set.dto';
import { UpdateTemplateSetDto } from './dtos/update-template-set.dto';

@Injectable()
export class TemplateSetService {
  constructor(
    private readonly prismaService: PrismaService,
    @InjectPinoLogger(TemplateSetService.name)
    private readonly logger: PinoLogger,
  ) {}

  async createTemplateSet(
    workoutTemplateExerciseId: number,
    userId: number,
    data: CreateTemplateSetDto,
  ) {
    this.logger.info(`Creating template set`, {
      workoutTemplateExerciseId,
      userId,
      data,
    });
    try {
      const templateExercise =
        await this.prismaService.workoutTemplateExercise.findUnique({
          where: { id: workoutTemplateExerciseId },
          include: { workoutTemplate: true },
        });

      if (
        !templateExercise ||
        templateExercise.workoutTemplate.userId !== userId
      ) {
        this.logger.warn(
          `User tried to create a template set for a template exercise that does not exist or they do not own`,
          { workoutTemplateExerciseId, userId },
        );
        throw new ForbiddenException('Not allowed');
      }

      return await this.prismaService.$transaction(async (tx) => {
        const maxSetNumber: { _max: { setNumber: number | null } } =
          await tx.workoutTemplateSet.aggregate({
            where: { workoutTemplateExerciseId },
            _max: { setNumber: true },
          });

        const nextSetNumber = (maxSetNumber._max.setNumber ?? 0) + 1;

        return tx.workoutTemplate.update({
          where: { id: templateExercise.workoutTemplateId },
          data: {
            workoutTemplateExercises: {
              update: {
                where: { id: workoutTemplateExerciseId },
                data: {
                  workoutTemplateSets: {
                    create: {
                      ...data,
                      setNumber: nextSetNumber,
                    },
                  },
                },
              },
            },
          },
          include: FULL_TEMPLATE_INCLUDE,
        });
      });
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to create template set`, {
        workoutTemplateExerciseId,
        userId,
        data,
        error,
      });
      throw new InternalServerErrorException('Failed to create template set');
    }
  }

  async updateTemplateSet(
    id: number,
    userId: number,
    data: UpdateTemplateSetDto,
  ) {
    this.logger.info(`Updating template set`, { id, userId, data });
    try {
      const templateSet =
        await this.prismaService.workoutTemplateSet.findUnique({
          where: { id },
          include: {
            workoutTemplateExercise: {
              include: { workoutTemplate: true },
            },
          },
        });

      if (
        !templateSet ||
        templateSet.workoutTemplateExercise.workoutTemplate.userId !== userId
      ) {
        this.logger.warn(
          `User tried to update a template set that does not exist or they do not own`,
          { id, userId },
        );
        throw new ForbiddenException('Not allowed');
      }

      return await this.prismaService.workoutTemplate.update({
        where: { id: templateSet.workoutTemplateExercise.workoutTemplateId },
        data: {
          workoutTemplateExercises: {
            update: {
              where: { id: templateSet.workoutTemplateExerciseId },
              data: {
                workoutTemplateSets: {
                  update: {
                    where: { id },
                    data,
                  },
                },
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
      this.logger.error(`Failed to update template set`, {
        id,
        userId,
        data,
        error,
      });
      throw new InternalServerErrorException('Failed to update template set');
    }
  }

  async deleteTemplateSet(id: number, userId: number) {
    this.logger.info(`Deleting template set`, { id, userId });
    try {
      const templateSet =
        await this.prismaService.workoutTemplateSet.findUnique({
          where: { id },
          include: {
            workoutTemplateExercise: {
              include: { workoutTemplate: true },
            },
          },
        });

      if (
        !templateSet ||
        templateSet.workoutTemplateExercise.workoutTemplate.userId !== userId
      ) {
        this.logger.warn(
          `User tried to delete a template set that does not exist or they do not own`,
          { id, userId },
        );
        throw new ForbiddenException('Not allowed');
      }

      return await this.prismaService.$transaction(async (tx) => {
        await tx.workoutTemplateSet.updateMany({
          where: {
            workoutTemplateExerciseId: templateSet.workoutTemplateExerciseId,
            setNumber: {
              gt: templateSet.setNumber,
            },
          },
          data: {
            setNumber: {
              decrement: 1,
            },
          },
        });

        return tx.workoutTemplate.update({
          where: { id: templateSet.workoutTemplateExercise.workoutTemplateId },
          data: {
            workoutTemplateExercises: {
              update: {
                where: { id: templateSet.workoutTemplateExerciseId },
                data: {
                  workoutTemplateSets: {
                    delete: { id },
                  },
                },
              },
            },
          },
          include: FULL_TEMPLATE_INCLUDE,
        });
      });
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to delete template set`, { id, userId, error });
      throw new InternalServerErrorException('Failed to delete template set');
    }
  }
}
