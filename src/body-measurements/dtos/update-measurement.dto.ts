import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export class UpdateMeasurementDto {
  @IsOptional()
  @IsDateString()
  measuredAt: string;

  @IsNumber()
  @IsPositive()
  weight: number;

  @IsOptional()
  @IsNumber()
  fatPercent: number;

  @IsOptional()
  @IsString()
  notes: string;

  @IsOptional()
  @IsString()
  imageUrl: string;
}
