import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ROUNDING_OPTIONS_KG } from 'src/common/constants';

const isSet = (_: unknown, value: unknown) =>
  value !== null && value !== undefined;

export const START_WEIGHTS_MODES = ['HISTORY', 'MANUAL', 'EMPTY'] as const;
export type StartWeightsMode = (typeof START_WEIGHTS_MODES)[number];

export class EnrollmentStateInputDto {
  @IsString()
  progressionKey: string;

  /** Swap the slot's exercise from the start. */
  @IsOptional()
  @IsInt()
  exerciseId?: number;

  @ValidateIf(isSet)
  @IsNumber()
  @Min(0)
  @Max(10000)
  workingWeight?: number | null;

  @ValidateIf(isSet)
  @IsNumber()
  @Min(0)
  @Max(10000)
  trainingMax?: number | null;

  @ValidateIf(isSet)
  @IsNumber()
  @Min(0)
  @Max(10000)
  e1rm?: number | null;

  @ValidateIf(isSet)
  @IsIn(ROUNDING_OPTIONS_KG)
  roundingKg?: number | null;
}

export class EnrollDto {
  @IsInt()
  programId: number;

  /** The user's local date (yyyy-MM-dd) the program starts on. */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate must be yyyy-MM-dd' })
  startDate: string;

  @IsOptional()
  @IsIn(START_WEIGHTS_MODES)
  startWeightsMode?: StartWeightsMode;

  /** CALENDAR programs: { programDayId: weekday 1..7 } overrides. */
  @IsOptional()
  @IsObject()
  weekdayMap?: Record<string, number>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => EnrollmentStateInputDto)
  states?: EnrollmentStateInputDto[];
}

export class PositionDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  cycle?: number;

  @IsInt()
  @Min(1)
  weekIndex: number;

  @IsInt()
  @Min(1)
  dayIndex: number;
}

export class StartProgramWorkoutDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  cycle?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  weekIndex?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  dayIndex?: number;
}

export class UpdateEnrollmentStateDto {
  @ValidateIf(isSet)
  @IsNumber()
  @Min(0)
  @Max(10000)
  workingWeight?: number | null;

  @ValidateIf(isSet)
  @IsNumber()
  @Min(0)
  @Max(10000)
  trainingMax?: number | null;

  @ValidateIf(isSet)
  @IsNumber()
  @Min(0)
  @Max(10000)
  e1rm?: number | null;

  @ValidateIf(isSet)
  @IsIn(ROUNDING_OPTIONS_KG)
  roundingKg?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  stageIndex?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  consecutiveFails?: number;
}

export class SwapExerciseDto {
  @IsInt()
  fromExerciseId: number;

  @IsInt()
  toExerciseId: number;
}
