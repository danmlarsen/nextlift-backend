import { IsIn, IsNumber, IsOptional } from 'class-validator';
import { WorkoutSetType } from 'src/workouts/types/workout.types';

export class CreateTemplateSetDto {
  @IsOptional()
  @IsNumber()
  reps: number;

  @IsOptional()
  @IsNumber()
  weight: number;

  @IsOptional()
  @IsNumber()
  duration: number;

  @IsOptional()
  @IsIn(Object.values(WorkoutSetType))
  type: WorkoutSetType;
}
