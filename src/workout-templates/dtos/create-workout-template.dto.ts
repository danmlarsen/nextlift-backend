import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CreateWorkoutTemplateDto {
  @IsString()
  @Length(2, 50, {
    message: 'Name must be minimum 2 characters and not exceed 50 characters',
  })
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(200, { message: 'Notes must not exceed 200 characters' })
  notes: string;
}
