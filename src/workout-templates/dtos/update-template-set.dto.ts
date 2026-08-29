import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  Max,
  Min,
} from 'class-validator';
import { WorkoutSetType } from 'src/workouts/types/workout.types';

export class UpdateTemplateSetDto {
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @IsInt()
  @Max(1000)
  reps: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10000)
  weight: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(86400)
  duration: number;

  @IsOptional()
  @IsIn(Object.values(WorkoutSetType))
  type: WorkoutSetType;
}
