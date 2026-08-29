import { IsNumber } from 'class-validator';

export class CreateTemplateExerciseDto {
  @IsNumber()
  exerciseId: number;
}
