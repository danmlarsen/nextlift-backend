import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { EnrollmentWorkoutService } from './enrollment-workout.service';
import { EnrollmentService } from './enrollment.service';
import { ProgramEnrollmentsController } from './program-enrollments.controller';
import { ProgramManagementService } from './program-management.service';
import { ProgramStructureService } from './program-structure.service';
import { ProgramsController } from './programs.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ProgramsController, ProgramEnrollmentsController],
  providers: [
    ProgramManagementService,
    ProgramStructureService,
    EnrollmentService,
    EnrollmentWorkoutService,
  ],
  exports: [EnrollmentWorkoutService],
})
export class ProgramsModule {}
