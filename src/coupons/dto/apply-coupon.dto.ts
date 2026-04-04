// src/coupons/dto/apply-coupon.dto.ts
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class ApplyCouponDto {
    @IsString()
    @IsNotEmpty()
    @Matches(/^[A-Za-z0-9-]{5,32}$/, {
        message: 'CODE_INVALID_FORMAT',
    })
    code!: string;
}
