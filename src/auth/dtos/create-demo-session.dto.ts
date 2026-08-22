import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateDemoSessionDto {
  @IsString()
  @IsNotEmpty()
  // reCAPTCHA tokens are well under 2KB; cap to reject oversized payloads.
  @MaxLength(4096)
  captchaToken: string;
}
