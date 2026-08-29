import { IsNumber } from 'class-validator';

export class CreateWorkoutFromTemplateDto {
  @IsNumber()
  templateId: number;
}
