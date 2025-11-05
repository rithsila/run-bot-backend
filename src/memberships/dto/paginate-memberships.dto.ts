// src/memberships/dto/paginate-memberships.dto.ts
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { MembershipStatus } from '../memberships.schema';

export class PaginateMembershipsDto {
    /** Search membership by email (case-insensitive substring match) */
    @IsOptional()
    @IsString()
    q?: string;

    /** Filter by status */
    @IsOptional()
    @IsEnum(MembershipStatus)
    status?: MembershipStatus;

    /** Page number (1-based) */
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page = 1;

    /** Page size */
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    limit = 10;
}
