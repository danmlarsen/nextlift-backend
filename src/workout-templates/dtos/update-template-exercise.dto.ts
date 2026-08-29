import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTemplateExerciseDto {
  @IsString()
  @IsOptional()
  @MaxLength(200, { message: 'Notes must not exceed 200 characters' })
  notes: string;
}
