import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { WorkoutSetType } from '../types/workout.types';
import { RPE_VALUES } from 'src/programs/engine/rts-table';

export class UpdateWorkoutSetDto {
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
  @IsBoolean()
  completed: boolean;

  @IsOptional()
  @IsIn(Object.values(WorkoutSetType))
  type: WorkoutSetType;

  /** Rating of perceived exertion, 6-10 in half steps; null clears it. */
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsIn(RPE_VALUES)
  rpe: number | null;
}
