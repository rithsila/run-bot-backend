// src/memberships/dto/update-membership.dto.ts
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { MembershipStatus } from '../memberships.enum';

export class UpdateMembershipDto {
    @IsOptional()
    @IsEnum(MembershipStatus)
    status?: MembershipStatus;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    adminNotes?: string;
}
