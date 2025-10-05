// src/auth/dto/login.dto.ts
import { IsEmail, IsOptional, IsString, MinLength, MaxLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @MaxLength(120)
  email!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsString()
  turnstileToken?: string;
}
