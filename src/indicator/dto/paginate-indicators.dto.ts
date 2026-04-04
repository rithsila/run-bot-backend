// src/indicator/dto/paginate-indicators.dto.ts
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { IndicatorStatus } from '../indicator.schema';

export class PaginateIndicatorsDto {
    @IsOptional()
    @IsString()
    @Transform(({ value }) =>
        typeof value === 'string' ? value.trim() : value,
    )
    q?: string;

    @IsOptional()
    @IsEnum(IndicatorStatus)
    status?: IndicatorStatus;

    @Type(() => Number)
    @IsInt()
    @Min(1)
    @IsOptional()
    page: number = 1;

    @Type(() => Number)
    @IsInt()
    @Min(1)
    @IsOptional()
    limit: number = 20;
}
