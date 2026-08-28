import { Test, TestingModule } from '@nestjs/testing';
import { WorkoutsController } from './workouts.controller';
import { WorkoutManagementService } from './workout-management.service';
import { WorkoutExerciseService } from './workout-exercise.service';
import { WorkoutSetService } from './workout-set.service';
import { WorkoutQueryService } from './workout-query.service';

describe('WorkoutsController', () => {
  let controller: WorkoutsController;
  const workoutQueryMock = {
    getWeeklyReport: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkoutsController],
      providers: [
        { provide: WorkoutManagementService, useValue: {} },
        { provide: WorkoutExerciseService, useValue: {} },
        { provide: WorkoutSetService, useValue: {} },
        { provide: WorkoutQueryService, useValue: workoutQueryMock },
      ],
    }).compile();

    controller = module.get<WorkoutsController>(WorkoutsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates weekly-report to the query service', () => {
    const user = { id: 42, email: 'test@example.com' };
    const weekStart = new Date('2026-08-17T00:00:00.000Z');
    const result = { totalWorkouts: 3 };
    workoutQueryMock.getWeeklyReport.mockReturnValue(result);

    expect(controller.getWeeklyReport(user, weekStart)).toBe(result);
    expect(workoutQueryMock.getWeeklyReport).toHaveBeenCalledWith(
      42,
      weekStart,
    );
  });
});
