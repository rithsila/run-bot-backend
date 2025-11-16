// src/order/dto/user-create-order.dto.ts
import { IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class UserCreateOrderDto {
    @IsMongoId()
    product!: string;

    // Optional coupon entered by the user
    @IsOptional()
    @IsString()
    @MaxLength(120)
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    couponCode?: string;

    // --- Customer-provided account info as STRINGS (optional) ---
    // TradingView username (string)
    @IsOptional()
    @IsString()
    @MinLength(2)
    @MaxLength(120)
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    tvUsernameAck?: string;

    // Account snapshot (free text or URL pasted by user)
    @IsOptional()
    @IsString()
    @MaxLength(2000)
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    accountSnapshotAck?: string;

    // Account concept (free text)
    @IsOptional()
    @IsString()
    @MaxLength(2000)
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    accountConceptAck?: string;

    // Risk management plan (free text)
    @IsOptional()
    @IsString()
    @MaxLength(2000)
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    riskManagementAck?: string;
}
