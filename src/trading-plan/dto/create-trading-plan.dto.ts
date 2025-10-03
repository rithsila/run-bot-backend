// src/trading-plans/dto/create-trading-plan.dto.ts
import { IsEnum, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { Direction, Pair } from '../trading-plan.enum';

export class CreateTradingPlanDto {
    @IsEnum(Pair)
    pair!: Pair;

    @IsEnum(Direction)
    direction!: Direction;

    @IsString()
    @IsOptional()
    @MaxLength(2000)
    description?: string;

    @IsString()
    @Length(1, 120)
    @Matches(/^[A-Za-z0-9_-]+$/)
    tradingViewId!: string;
}
