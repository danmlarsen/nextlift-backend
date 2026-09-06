import { Module } from '@nestjs/common';
import { WorkoutsController } from './workouts.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { WorkoutExerciseService } from './workout-exercise.service';
import { WorkoutSetService } from './workout-set.service';
import { WorkoutQueryService } from './workout-query.service';
import { WorkoutManagementService } from './workout-management.service';
import { PersonalRecordsModule } from 'src/personal-records/personal-records.module';
import { ProgramsModule } from 'src/programs/programs.module';

@Module({
  imports: [PrismaModule, PersonalRecordsModule, ProgramsModule],
  providers: [
    WorkoutManagementService,
    WorkoutQueryService,
    WorkoutExerciseService,
    WorkoutSetService,
  ],
  controllers: [WorkoutsController],
})
export class WorkoutsModule {}
