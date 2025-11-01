// src/users/dto/admin-set-password.dto.ts
import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class AdminSetPasswordDto {
    @IsString()
    @MinLength(6)
    @MaxLength(128)
    @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
        message: 'Password must include upper, lower, and number',
    })
    password!: string; // ← as you requested
}
