import { IsIn, IsNumber, IsOptional, ValidateIf } from 'class-validator';
import { RPE_VALUES } from 'src/programs/engine/rts-table';

export class CreateWorkoutSetDto {
  @IsOptional()
  @IsNumber()
  reps: number;

  @IsOptional()
  @IsNumber()
  weight: number;

  @IsOptional()
  @IsNumber()
  duration: number;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsIn(RPE_VALUES)
  rpe: number | null;
}
