// src/auth/dto/login.dto.ts
import { IsOptional, IsString, MinLength, MaxLength } from 'class-validator';
import { EmailField } from 'src/common/validators/email-field.decorator';

export class LoginDto {
    @EmailField()
    email!: string;

    @IsString()
    @MinLength(6)
    @MaxLength(128)
    password!: string;

    @IsOptional()
    @IsString()
    turnstileToken?: string;
}
