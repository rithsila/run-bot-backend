// src/auth/dto/login.dto.ts
import {
  IsEmail,
  IsIn,
  IsString,
  MinLength,
  MaxLength,
} from 'class-validator';

export class LoginDto {
  @IsEmail()
  @MaxLength(120)
  email!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password!: string;

  @IsIn(['admin', 'student', 'instructor'])
  app!: 'admin' | 'student' | 'instructor';
}
