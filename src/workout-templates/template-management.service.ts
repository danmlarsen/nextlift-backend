import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { FULL_TEMPLATE_INCLUDE } from './const/full-template-include';
import { CreateWorkoutTemplateDto } from './dtos/create-workout-template.dto';
import { UpdateWorkoutTemplateDto } from './dtos/update-workout-template.dto';
import { CreateTemplateFromWorkoutDto } from './dtos/create-template-from-workout.dto';
import { MAX_TEMPLATES_PER_USER } from 'src/common/constants';

@Injectable()
export class TemplateManagementService {
  constructor(
    private readonly prismaService: PrismaService,
    @InjectPinoLogger(TemplateManagementService.name)
    private readonly logger: PinoLogger,
  ) {}

  private async ensureTemplateCapacity(userId: number) {
    const templateCount = await this.prismaService.workoutTemplate.count({
      where: { userId },
    });
    if (templateCount >= MAX_TEMPLATES_PER_USER) {
      this.logger.warn(`User reached the workout template limit`, { userId });
      throw new BadRequestException('Template limit reached');
    }
  }

  async getWorkoutTemplates(userId: number) {
    this.logger.info(`Getting workout templates`, { userId });
    try {
      return await this.prismaService.workoutTemplate.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        include: FULL_TEMPLATE_INCLUDE,
      });
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to get workout templates`, { userId, error });
      throw new InternalServerErrorException('Failed to get workout templates');
    }
  }

  async getWorkoutTemplate(userId: number, id: number) {
    this.logger.info(`Getting workout template`, { userId, id });
    try {
      const template = await this.prismaService.workoutTemplate.findFirst({
        where: { id, userId },
        include: FULL_TEMPLATE_INCLUDE,
      });

      if (!template) {
        this.logger.warn(
          `User tried to get a workout template that does not exist or they do not own`,
          { userId, id },
        );
        throw new ForbiddenException('Not allowed');
      }

      return template;
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to get workout template`, {
        userId,
        id,
        error,
      });
      throw new InternalServerErrorException('Failed to get workout template');
    }
  }

  async createWorkoutTemplate(userId: number, data: CreateWorkoutTemplateDto) {
    this.logger.info(`Creating workout template`, { userId, data });
    try {
      await this.ensureTemplateCapacity(userId);

      return await this.prismaService.workoutTemplate.create({
        data: { ...data, userId },
        include: FULL_TEMPLATE_INCLUDE,
      });
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to create workout template`, {
        userId,
        data,
        error,
      });
      throw new InternalServerErrorException(
        'Failed to create workout template',
      );
    }
  }

  async createTemplateFromWorkout(
    userId: number,
    data: CreateTemplateFromWorkoutDto,
  ) {
    this.logger.info(`Creating workout template from workout`, {
      userId,
      data,
    });
    try {
      const workout = await this.prismaService.workout.findFirst({
        where: { id: data.workoutId, userId },
        include: {
          workoutExercises: {
            orderBy: { exerciseOrder: 'asc' },
            include: {
              workoutSets: {
                orderBy: [{ setNumber: 'asc' }, { createdAt: 'asc' }],
              },
            },
          },
        },
      });

      if (!workout) {
        this.logger.warn(
          `User tried to create a template from a workout that does not exist or they do not own`,
          { userId, workoutId: data.workoutId },
        );
        throw new ForbiddenException('Not allowed');
      }

      await this.ensureTemplateCapacity(userId);

      // Snapshot the workout's structure. Order fields are renumbered to a
      // canonical 1..n (the source may have gaps from deletes); the sets'
      // completed flag has no meaning on a template and is dropped.
      return await this.prismaService.workoutTemplate.create({
        data: {
          userId,
          name: data.name,
          notes: workout.notes,
          workoutTemplateExercises: {
            create: workout.workoutExercises.map(
              (workoutExercise, exerciseIndex) => ({
                exerciseId: workoutExercise.exerciseId,
                exerciseOrder: exerciseIndex + 1,
                notes: workoutExercise.notes,
                workoutTemplateSets: {
                  create: workoutExercise.workoutSets.map(
                    (workoutSet, setIndex) => ({
                      setNumber: setIndex + 1,
                      type: workoutSet.type,
                      reps: workoutSet.reps,
                      weight: workoutSet.weight,
                      duration: workoutSet.duration,
                      notes: workoutSet.notes,
                    }),
                  ),
                },
              }),
            ),
          },
        },
        include: FULL_TEMPLATE_INCLUDE,
      });
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to create workout template from workout`, {
        userId,
        data,
        error,
      });
      throw new InternalServerErrorException(
        'Failed to create workout template from workout',
      );
    }
  }

  async updateWorkoutTemplate(
    userId: number,
    id: number,
    data: UpdateWorkoutTemplateDto,
  ) {
    this.logger.info(`Updating workout template`, { userId, id, data });
    try {
      const template = await this.prismaService.workoutTemplate.findFirst({
        where: { id, userId },
      });

      if (!template) {
        this.logger.warn(
          `User tried to update a workout template that does not exist or they do not own`,
          { userId, id },
        );
        throw new ForbiddenException('Not allowed');
      }

      return await this.prismaService.workoutTemplate.update({
        where: { id, userId },
        data,
        include: FULL_TEMPLATE_INCLUDE,
      });
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to update workout template`, {
        userId,
        id,
        data,
        error,
      });
      throw new InternalServerErrorException(
        'Failed to update workout template',
      );
    }
  }

  async deleteWorkoutTemplate(userId: number, id: number) {
    this.logger.info(`Deleting workout template`, { userId, id });
    try {
      const template = await this.prismaService.workoutTemplate.findFirst({
        where: { id, userId },
      });

      if (!template) {
        this.logger.warn(
          `User tried to delete a workout template that does not exist or they do not own`,
          { userId, id },
        );
        throw new ForbiddenException('Not allowed');
      }

      return await this.prismaService.workoutTemplate.delete({
        where: { id, userId },
        include: FULL_TEMPLATE_INCLUDE,
      });
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Failed to delete workout template`, {
        userId,
        id,
        error,
      });
      throw new InternalServerErrorException(
        'Failed to delete workout template',
      );
    }
  }
}
