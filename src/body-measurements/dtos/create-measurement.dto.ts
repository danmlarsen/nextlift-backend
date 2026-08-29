import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateMeasurementDto {
  @IsOptional()
  @IsDateString()
  measuredAt: string;

  @IsNumber()
  @IsPositive()
  weight: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(75)
  fatPercent: number;

  @IsOptional()
  @IsString()
  notes: string;

  @IsOptional()
  @IsString()
  imageUrl: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(500)
  neckCm: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(500)
  chestCm: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(500)
  waistCm: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(500)
  hipsCm: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(500)
  armCm: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(500)
  thighCm: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(500)
  calfCm: number;
}
