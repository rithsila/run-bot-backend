// src/memberships/dto/update-membership-admin.dto.ts
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { MembershipStatus } from '../memberships.schema';

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
}
