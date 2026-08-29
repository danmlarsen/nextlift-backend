import { IsNumber, IsString, Length } from 'class-validator';

export class CreateTemplateFromWorkoutDto {
  @IsNumber()
  workoutId: number;

  @IsString()
  @Length(2, 50, {
    message: 'Name must be minimum 2 characters and not exceed 50 characters',
  })
  name: string;
}
