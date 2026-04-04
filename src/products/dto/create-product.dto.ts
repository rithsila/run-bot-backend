import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsEnum,
    IsNumber,
    IsOptional,
    IsString,
    IsUrl,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BillPeriod } from '../product.schema';

class PayWayUrlDto {
    @IsEnum(BillPeriod)
    billPeriod!: BillPeriod;

    @IsNumber()
    @Min(0)
    pricing!: number;

    @IsUrl({ require_protocol: true })
    @MaxLength(500)
    url!: string;
}

export class CreateProductDto {
    @IsString()
    @MaxLength(120)
    name!: string;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    description?: string;

    @IsOptional()
    @IsString()
    @MaxLength(4000)
    features?: string;

    @IsBoolean()
    requireTradingViewUsername!: boolean;

    @IsOptional()
    @IsString()
    @MaxLength(4000)
    policy?: string;

    @IsBoolean()
    requiresLicenseKey!: boolean;

    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(10)
    @ValidateNested({ each: true })
    @Type(() => PayWayUrlDto)
    payWayUrls!: PayWayUrlDto[];
}
