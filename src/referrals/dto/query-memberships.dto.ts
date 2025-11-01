import { IsInt, IsOptional, IsString, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { MembershipStatus } from '../memberships.enum';

export class QueryMembershipsDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    limit?: number = 20;

    @IsOptional()
    @IsString()
    q?: string; 

    @IsOptional()
    @IsIn(Object.values(MembershipStatus))
    status?: MembershipStatus;
}
