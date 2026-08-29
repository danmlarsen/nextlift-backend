import {
  IsDateString,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Max,
  MaxLength,
} from 'class-validator';

export class UpdateWorkoutDto {
  @IsString()
  @IsOptional()
  @Length(2, 50, {
    message: 'Title must be minimum 2 characters and not exceed 50 characters',
  })
  title: string;

  @IsString()
  @IsOptional()
  @MaxLength(200, { message: 'Notes must not exceed 200 characters' })
  notes: string;

  @IsOptional()
  @IsDateString()
  startedAt: string;

  @IsOptional()
  @IsPositive()
  @Max(43200, { message: 'Active duration cannot exceed 12 hours' })
  activeDuration: number;
}
