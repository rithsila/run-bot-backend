// src/plans/dto/create-plan.dto.ts
import { Transform, Type } from 'class-transformer';
import {
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    IsUrl,
    MaxLength,
    Min,
} from 'class-validator';
import { PlanCategory, PlanProducts } from '../plan.enum';

const trim = () =>
    Transform(({ value }) =>
        typeof value === 'string' ? value.trim() : value,
    );

export class CreatePlanDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    @trim()
    title!: string;

    /** description – marketing/detail text */
    @IsString()
    @IsOptional()
    @MaxLength(2000)
    @trim()
    description?: string;

    /** price – numeric amount (no currency) */
    @Type(() => Number)
    @IsNumber({ allowInfinity: false, allowNaN: false })
    @Min(0)
    price!: number;

    /** billingPeriod – number of months (e.g., 1, 6, 12) */
    @Type(() => Number)
    @IsInt()
    @Min(1)
    billingPeriod!: number;

    /** paymentUrl – checkout URL */
    @IsString()
    @IsNotEmpty()
    @MaxLength(500)
    @IsUrl({ require_protocol: true })
    @trim()
    paymentUrl!: string;

    @IsString()
    @IsOptional()
    discountUrl: string;

    /** category – service type (Indicator, Course, VPS, Bot) */
    @IsEnum(PlanCategory)
    category!: PlanCategory;

    @IsString()
    @IsOptional()
    product?: string;

    @IsString()
    @IsOptional()
    @MaxLength(4000)
    @trim()
    features?: string;

    /** marketingTagline – short promo text (e.g., "Save $2", "Most Popular") */
    @IsString()
    @IsOptional()
    @MaxLength(80)
    @trim()
    marketingTagline?: string;

    @IsOptional()
    allowCoupons?: boolean;
}
