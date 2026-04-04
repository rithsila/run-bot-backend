// src/analyze-news/dto/create-analyze-news.dto.ts
import {
    IsArray,
    ArrayUnique,
    IsEnum,
    IsOptional,
    IsString,
    Length,
    MaxLength,
    IsUrl,
} from 'class-validator';
import { Direction, Pair } from 'src/trading-plan/trading-plan.enum';

export class CreateAnalyzeNewsDto {
    @IsString()
    @Length(1, 200)
    title!: string;

    @IsOptional()
    pair?: Pair;

    @IsOptional()
    @IsEnum(Direction)
    impact?: Direction;

    @IsOptional()
    description: string;

    @IsOptional()
    @IsUrl({ require_tld: false })
    @MaxLength(500)
    thumbnailUrl?: string;
}
