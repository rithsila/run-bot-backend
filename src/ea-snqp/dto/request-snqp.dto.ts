// src/ea-snqp/dto/request-snqp.dto.ts
import { Transform } from 'class-transformer';
import {
    IsArray,
    IsOptional,
    IsString,
    MaxLength,
    Matches,
    ArrayMaxSize,
} from 'class-validator';


export class RequestSnqpDto {
    @IsOptional()
    @IsString()
    @MaxLength(200)
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    tradingAccount?: string;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(100) // safety cap; tweak as needed
    @Transform(({ value }) => {
        // Normalize to array of trimmed strings without empties
        if (!Array.isArray(value)) return [];
        return value
            .map((v) => (typeof v === 'string' ? v.trim() : ''))
            .filter(Boolean);
    })
    @Matches(/^[A-Za-z0-9._-]{3,50}$/, {
        each: true,
        message:
            'Each account number must be 3–50 chars, alphanumeric plus . _ - only.',
    })
    accountNumbers?: string[];

    @IsString()
    @MaxLength(200)
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    tradingView?: string;

    @IsOptional()
    @IsString()
    @MaxLength(5000)
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    bankAccount?: string;
}
