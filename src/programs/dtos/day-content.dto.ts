import { ProgressionStrategy } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  MAX_EXERCISES_PER_PROGRAM_DAY,
  MAX_PROGRAM_WEEKS,
  MAX_SET_ROWS_PER_PROGRAM_EXERCISE,
  ROUNDING_OPTIONS_KG,
} from 'src/common/constants';
import { WorkoutSetType } from 'src/workouts/types/workout.types';
import { RPE_VALUES } from '../engine/rts-table';
import {
  PROGRESSION_PARAMS_TYPE_OPTIONS,
  ProgressionParamsBaseDto,
  ProgressionParamsDto,
} from './progression-params.dto';

const isSet = (_: unknown, value: unknown) =>
  value !== null && value !== undefined;

export class ProgramSetInputDto {
  @ValidateIf(isSet)
  @IsInt()
  @Min(1)
  @Max(MAX_PROGRAM_WEEKS)
  weekInBlock?: number | null;

  @IsOptional()
  @IsIn(Object.values(WorkoutSetType))
  type?: WorkoutSetType;

  @ValidateIf(isSet)
  @IsInt()
  @Min(1)
  @Max(1000)
  repsMin?: number | null;

  @ValidateIf(isSet)
  @IsInt()
  @Min(1)
  @Max(1000)
  repsMax?: number | null;

  @IsOptional()
  @IsBoolean()
  isAmrap?: boolean;

  @ValidateIf(isSet)
  @IsNumber()
  @Min(1)
  @Max(200)
  percent?: number | null;

  @ValidateIf(isSet)
  @IsNumber()
  @Min(0)
  @Max(10000)
  weight?: number | null;

  @ValidateIf(isSet)
  @IsIn(RPE_VALUES)
  targetRpe?: number | null;

  @ValidateIf(isSet)
  @IsInt()
  @Min(0)
  @Max(3600)
  restSeconds?: number | null;

  @ValidateIf(isSet)
  @IsInt()
  @Min(1)
  @Max(86400)
  duration?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  notes?: string | null;
}

export class ProgramExerciseInputDto {
  @IsInt()
  exerciseId: number;

  /** Slots sharing a key share progression state. Generated when omitted. */
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9_-]{0,49}$/, {
    message:
      'progressionKey must be 1-50 lowercase letters, digits, dashes or underscores',
  })
  progressionKey?: string;

  @IsEnum(ProgressionStrategy)
  strategy: ProgressionStrategy;

  @ValidateIf(isSet)
  @ValidateNested()
  @Type(() => ProgressionParamsBaseDto, PROGRESSION_PARAMS_TYPE_OPTIONS)
  progression?: ProgressionParamsDto | null;

  @ValidateIf(isSet)
  @IsIn(ROUNDING_OPTIONS_KG)
  roundingKg?: number | null;

  @ValidateIf(isSet)
  @IsInt()
  @Min(0)
  @Max(3600)
  restSeconds?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  notes?: string | null;

  @IsArray()
  @ArrayMaxSize(MAX_SET_ROWS_PER_PROGRAM_EXERCISE)
  @ValidateNested({ each: true })
  @Type(() => ProgramSetInputDto)
  sets: ProgramSetInputDto[];
}

/** Replace-all body for one program day's exercises and sets. */
export class PutDayContentDto {
  @IsArray()
  @ArrayMaxSize(MAX_EXERCISES_PER_PROGRAM_DAY)
  @ValidateNested({ each: true })
  @Type(() => ProgramExerciseInputDto)
  exercises: ProgramExerciseInputDto[];
}
