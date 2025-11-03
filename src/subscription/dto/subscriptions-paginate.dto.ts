import { IsInt, IsOptional, IsString, Min, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import type { SubscriptionStatus } from '../subscription.schema';

export class SubscriptionsPaginateDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    limit?: number;

    // "active" | "past_due" | "paused" | "canceled"
    @IsOptional()
    @IsString()
    status?: SubscriptionStatus;

    // search by user firstName / lastName
    @IsOptional()
    @IsString()
    search?: string;
}
