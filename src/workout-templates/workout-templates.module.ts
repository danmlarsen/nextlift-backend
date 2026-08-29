import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { WorkoutTemplatesController } from './workout-templates.controller';
import { TemplateManagementService } from './template-management.service';
import { TemplateExerciseService } from './template-exercise.service';
import { TemplateSetService } from './template-set.service';

@Module({
  imports: [PrismaModule],
  controllers: [WorkoutTemplatesController],
  providers: [
    TemplateManagementService,
    TemplateExerciseService,
    TemplateSetService,
  ],
})
export class WorkoutTemplatesModule {}
