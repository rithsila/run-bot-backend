import { IsEnum, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { CouponStatus } from '../coupon.schema';

export class UpdateCouponStatusAdminDto {
    @IsOptional()
    @IsEnum(CouponStatus)
    status?: CouponStatus;

    @IsOptional()
    @IsNumber(
        { allowNaN: false, allowInfinity: false },
        { message: 'percent must be a number' },
    )
    @Min(0.01)
    @Max(100)
    percent?: number;
}
