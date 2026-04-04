import {
    IsEnum,
    IsOptional,
    IsString,
    Length,
    Matches,
    MaxLength,
    IsUrl,
} from 'class-validator';
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

    @IsOptional()
    @IsString()
    tradingViewId?: string; // ✅ now optional

    /** Optional thumbnail (e.g., Cloudinary/S3 URL) */
    @IsOptional()
    @IsUrl({ require_tld: false })
    @MaxLength(500)
    thumbnailUrl?: string;
}
