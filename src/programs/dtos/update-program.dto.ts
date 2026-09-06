import {
  EffortScale,
  ProgramDurationMode,
  ProgramGoal,
  ProgramLevel,
  ProgramScheduleMode,
} from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateProgramDto {
  @IsOptional()
  @IsString()
  @Length(2, 60, {
    message: 'Name must be minimum 2 characters and not exceed 60 characters',
  })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Description must not exceed 1000 characters' })
  description?: string | null;

  @IsOptional()
  @IsEnum(ProgramGoal)
  goal?: ProgramGoal;

  @IsOptional()
  @IsEnum(ProgramLevel)
  level?: ProgramLevel;

  @IsOptional()
  @IsEnum(ProgramScheduleMode)
  scheduleMode?: ProgramScheduleMode;

  @IsOptional()
  @IsEnum(ProgramDurationMode)
  durationMode?: ProgramDurationMode;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  daysPerWeek?: number;

  @IsOptional()
  @IsEnum(EffortScale)
  effortScale?: EffortScale;
}
