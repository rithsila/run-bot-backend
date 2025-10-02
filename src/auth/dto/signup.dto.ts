// src/auth/dto/signup.dto.ts
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class SignupDto {
  @IsString() @MinLength(1) @MaxLength(60) 
  firstName!: string;
  
  @IsOptional() @IsString() @MaxLength(60) 
  lastName?: string;
  
  @IsEmail() @MaxLength(120) 
  email!: string;

  @IsString() @MinLength(6) @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, { message: 'Password must include upper, lower, and number' })
  password!: string;

  // Accept-but-ignore if some layer injects them
  @IsOptional() @IsString() @MaxLength(200) userAgent?: string;
  @IsOptional() @IsString() @MaxLength(200) referer?: string;
}
