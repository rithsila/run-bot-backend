// src/order/dto/user-create-order.dto.ts
import { IsMongoId, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
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

    // Bank account name (customer uppercase full name, e.g. "JOHN DOE")
    @IsString()
    @MinLength(4)
    @MaxLength(120)
    @Matches(/^[A-Z]+(?: [A-Z]+)+$/, {
        message:
            'Bank Account Name must be uppercase words separated by spaces (e.g. JOHN DOE)',
    })
    @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
    bankAccountName!: string;
}
