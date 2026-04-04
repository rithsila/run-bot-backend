import { IsOptional, IsString, MinLength, MaxLength } from 'class-validator';

export class ResetPasswordDto {
    @IsString()
    token!: string;

    @IsString()
    @MinLength(6)
    @MaxLength(128)
    password!: string;

    @IsOptional()
    @IsString()
    turnstileToken?: string;
}
