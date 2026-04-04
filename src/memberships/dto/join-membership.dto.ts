// src/memberships/dto/join-membership.dto.ts
import { Transform } from 'class-transformer';
import {
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
    IsArray,
    ArrayMaxSize,
    ArrayMinSize,
} from 'class-validator';
import { EmailField } from 'src/common/validators/email-field.decorator';

export class JoinMembershipDto {
    @EmailField()
    @IsNotEmpty()
    email!: string;

    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(10)
    @IsString({ each: true })
    @MaxLength(120, { each: true })
    @Transform(({ value }) => {
        if (typeof value === 'string') return [value.trim()].filter(Boolean);
        if (Array.isArray(value)) {
            return value
                .map((v) => (typeof v === 'string' ? v.trim() : v))
                .filter((v) => typeof v === 'string' && v.length > 0);
        }
        return value;
    })
    accounts!: string[];

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    notes?: string;

    @IsString()
    @Transform(({ value }) =>
        typeof value === 'string' ? value.trim() : value,
    )
    referral: string;
}
