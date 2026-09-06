import { Type, TypeOptions } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/**
 * Strategy parameters stored in `ProgramExercise.progression`. The `strategy`
 * property doubles as the class-transformer discriminator, so the nested
 * object is validated against the right shape.
 */
export class LinearStageDto {
  @IsInt()
  @Min(1)
  @Max(20)
  sets: number;

  @IsInt()
  @Min(1)
  @Max(100)
  reps: number;

  @IsOptional()
  @IsBoolean()
  amrapLast?: boolean;
}

export class LinearParamsDto {
  @IsIn(['LINEAR'])
  strategy: 'LINEAR';

  @IsNumber()
  @Min(0)
  @Max(50)
  incrementKg: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  failThreshold?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50)
  deloadPercent?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => LinearStageDto)
  stages?: LinearStageDto[];

  @IsOptional()
  @IsNumber()
  @Min(50)
  @Max(100)
  stageResetPercent?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  amrapRepsThreshold?: number;
}

export class DoubleParamsDto {
  @IsIn(['DOUBLE'])
  strategy: 'DOUBLE';

  @IsNumber()
  @Min(0)
  @Max(50)
  incrementKg: number;

  @IsOptional()
  @IsIn(['LOAD', 'REPS'])
  mode?: 'LOAD' | 'REPS';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  repsStep?: number;
}

export class AmrapTmRuleDto {
  @IsInt()
  @Min(0)
  @Max(100)
  minReps: number;

  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(100)
  maxReps: number | null;

  @IsNumber()
  @Min(0)
  @Max(50)
  incrementKg: number;
}

export class PercentTmParamsDto {
  @IsIn(['PERCENT_TM'])
  strategy: 'PERCENT_TM';

  @IsOptional()
  @IsNumber()
  @Min(50)
  @Max(100)
  tmPercentOf1RM?: number;

  @IsNumber()
  @Min(0)
  @Max(50)
  tmIncrementKg: number;

  @IsOptional()
  @IsIn(['CYCLE_END', 'AMRAP', 'NONE'])
  tmAdvance?: 'CYCLE_END' | 'AMRAP' | 'NONE';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AmrapTmRuleDto)
  amrapTmRule?: AmrapTmRuleDto[];
}

export class RpeParamsDto {
  @IsIn(['RPE'])
  strategy: 'RPE';

  @IsIn(['TOP_SET_BACKOFF', 'RIR_MESOCYCLE'])
  mode: 'TOP_SET_BACKOFF' | 'RIR_MESOCYCLE';

  @ValidateIf((o: RpeParamsDto) => o.mode === 'TOP_SET_BACKOFF')
  @IsNumber()
  @Min(50)
  @Max(100)
  backoffPercent?: number;

  @ValidateIf((o: RpeParamsDto) => o.mode === 'TOP_SET_BACKOFF')
  @IsInt()
  @Min(0)
  @Max(10)
  backoffSets?: number;

  @ValidateIf((o: RpeParamsDto) => o.mode === 'RIR_MESOCYCLE')
  @IsInt()
  @Min(0)
  @Max(5)
  startRir?: number;

  @ValidateIf((o: RpeParamsDto) => o.mode === 'RIR_MESOCYCLE')
  @IsInt()
  @Min(0)
  @Max(5)
  endRir?: number;

  @ValidateIf((o: RpeParamsDto) => o.mode === 'RIR_MESOCYCLE')
  @IsInt()
  @Min(0)
  @Max(5)
  addSetsPerWeek?: number;

  @ValidateIf((o: RpeParamsDto) => o.mode === 'RIR_MESOCYCLE')
  @IsInt()
  @Min(1)
  @Max(20)
  maxSets?: number;

  @ValidateIf((o: RpeParamsDto) => o.mode === 'RIR_MESOCYCLE')
  @IsNumber()
  @Min(0)
  @Max(50)
  incrementKg?: number;
}

export class NoneParamsDto {
  @IsIn(['NONE'])
  strategy: 'NONE';

  @IsOptional()
  @IsIn(['FIXED', 'WORKING_WEIGHT', 'TRAINING_MAX'])
  basis?: 'FIXED' | 'WORKING_WEIGHT' | 'TRAINING_MAX';
}

export class ProgressionParamsBaseDto {
  strategy: string;
}

export type ProgressionParamsDto =
  | LinearParamsDto
  | DoubleParamsDto
  | PercentTmParamsDto
  | RpeParamsDto
  | NoneParamsDto;

/** class-transformer options shared by every DTO carrying progression params. */
export const PROGRESSION_PARAMS_TYPE_OPTIONS: TypeOptions = {
  discriminator: {
    property: 'strategy',
    subTypes: [
      { value: LinearParamsDto, name: 'LINEAR' },
      { value: DoubleParamsDto, name: 'DOUBLE' },
      { value: PercentTmParamsDto, name: 'PERCENT_TM' },
      { value: RpeParamsDto, name: 'RPE' },
      { value: NoneParamsDto, name: 'NONE' },
    ],
  },
  keepDiscriminatorProperty: true,
};
