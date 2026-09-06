import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateProgramDayDto {
  @IsString()
  @Length(1, 50)
  name: string;

  /** 1 = Monday ... 7 = Sunday (CALENDAR programs). */
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsInt()
  @Min(1)
  @Max(7)
  weekday?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  notes?: string | null;
}

export class UpdateProgramDayDto {
  @IsOptional()
  @IsString()
  @Length(1, 50)
  name?: string;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsInt()
  @Min(1)
  @Max(7)
  weekday?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  notes?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  dayOrder?: number;
}

export class ImportDayFromTemplateDto {
  @IsNumber()
  templateId: number;
}
