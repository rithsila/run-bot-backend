import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { TradingPlatform } from '../trading-robot.schema';

export class CreateTradingRobotDto {
    @IsString()
    @MaxLength(120)
    name!: string;

    @IsString()
    @MaxLength(2000)
    description!: string;

    @IsString()
    @MaxLength(20)
    version!: string;

    @IsEnum(TradingPlatform)
    platform!: TradingPlatform;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    fileSize?: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    downloadUrl?: string;
}
