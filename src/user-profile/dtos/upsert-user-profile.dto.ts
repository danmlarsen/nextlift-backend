import { ActivityLevel, Sex, WeightGoal } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  Max,
} from 'class-validator';

export class UpsertUserProfileDto {
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(272)
  heightCm: number;

  @IsOptional()
  @IsDateString()
  birthDate: string;

  @IsOptional()
  @IsEnum(Sex)
  sex: Sex;

  @IsOptional()
  @IsEnum(ActivityLevel)
  activityLevel: ActivityLevel;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(500)
  goalWeight: number;

  @IsOptional()
  @IsEnum(WeightGoal)
  weightGoal: WeightGoal;
}
