// src/memberships/dto/memberships-paginate.dto.ts
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { MembershipStatus } from '../memberships.enum';

export class MembershipsPaginateDto {
    @IsInt()
    @Min(1)
    @Transform(({ value }) => Number(value) || 1)
    page = 1;

    @IsInt()
    @Min(1)
    @Transform(({ value }) => Number(value) || 20)
    limit = 20;

    @IsOptional()
    @IsEnum(MembershipStatus)
    status?: MembershipStatus;
}
