// src/ea-snqp/dto/get-all-snqp.dto.ts
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsMongoId, IsOptional, IsPositive, Min, IsString, MaxLength } from 'class-validator';
import { MembershipStatus } from 'src/referrals/memberships.enum';

export class GetAllSnqpDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsPositive()
    @IsInt()
    limit?: number = 20;

    /** Filter by status */
    @IsOptional()
    @IsEnum(MembershipStatus)
    status?: MembershipStatus;

    /** Search term: matches bankAccount, user first/last/email */
    @IsOptional()
    @IsString()
    @MaxLength(120)
    q?: string;

    /** Optional exact user filter (by ObjectId) */
    @IsOptional()
    @IsMongoId()
    userId?: string;
}
