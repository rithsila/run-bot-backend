// src/memberships/dto/update-membership-admin.dto.ts
import {
    IsBoolean,
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MembershipStatus } from '../memberships.schema';

// Local DTO for accounts
class MembershipAccountDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    account!: string;

    @IsBoolean()
    isVerified!: boolean;
}

export class UpdateMembershipAdminDto {
    /** New status (optional) */
    @IsOptional()
    @IsEnum(MembershipStatus)
    status?: MembershipStatus;

    /** Admin-facing note / reason (optional) */
    @IsOptional()
    @IsString()
    @MaxLength(1000)
    adminNotes?: string;

    /** Accounts (optional) */
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => MembershipAccountDto)
    accounts?: MembershipAccountDto[];
}
