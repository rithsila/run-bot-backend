// src/memberships/dto/create-membership.dto.ts
import {
    IsEmail,
    IsOptional,
    IsString,
    MaxLength,
    IsArray,
    ArrayMinSize,
    ArrayMaxSize,
    ArrayUnique,
    Matches,
    MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateMembershipDto {
    @IsEmail()
    @MaxLength(120)
    @Transform(({ value }) => String(value).trim().toLowerCase())
    email!: string;

    @IsString()
    referral: string;

    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(20)
    @ArrayUnique()
    @Transform(({ value }) =>
        Array.isArray(value)
            ? value.map((v) => (typeof v === 'string' ? v.trim() : v)).filter(Boolean)
            : value
    )
    @Matches(/^[A-Za-z0-9._-]{3,50}$/, {
        each: true,
        message: 'Each account number must be 3–50 chars, alphanumeric plus . _ - only',
    })
    accountNumbers!: string[];


    @IsOptional() @IsString() @MinLength(5) @MaxLength(2000)
    @Transform(({ value }) => {
        if (typeof value !== 'string') return value;
        const t = value.trim();
        return t === '' ? undefined : t;
    })
    notes?: string;
}
