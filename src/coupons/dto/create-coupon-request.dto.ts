// src/coupons/dto/create-coupon-request.dto.ts
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class CreateCouponRequestDto {
    @Transform(({ value }) =>
        String(value ?? '')
            .trim()
            .toUpperCase(),
    )
    @IsString()
    @IsNotEmpty()
    // 5–32 chars; A–Z, 0–9, dashes only
    @Matches(/^[A-Z0-9-]{5,32}$/, {
        message: 'code must be 5-32 chars, A-Z, 0-9, or dashes',
    })
    code!: string;
}
