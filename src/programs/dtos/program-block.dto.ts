import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_PROGRAM_WEEKS } from 'src/common/constants';

export class CreateProgramBlockDto {
  @IsString()
  @Length(1, 50)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  focus?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PROGRAM_WEEKS)
  weeks?: number;
}

export class UpdateProgramBlockDto {
  @IsOptional()
  @IsString()
  @Length(1, 50)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  focus?: string | null;

  /** Resizing removes trailing weeks or appends default weeks. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PROGRAM_WEEKS)
  weeks?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  blockOrder?: number;
}

export class UpdateProgramWeekDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  label?: string | null;

  @IsOptional()
  @IsBoolean()
  isDeload?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(2)
  volumeMultiplier?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(1.5)
  intensityMultiplier?: number;
}
