// src/indicator/dto/request-indicator.dto.ts
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RequestIndicatorDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    @Transform(({ value }) =>
        typeof value === 'string' ? value.trim() : value,
    )
    username!: string;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    @Transform(({ value }) =>
        typeof value === 'string' ? value.trim() : value,
    )
    notes?: string;
}
