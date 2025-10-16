// src/coupons/dto/create-coupon.dto.ts
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { CouponStatus } from '../plan.enum';

export class CreateCouponDto {
  @IsString()
  owner!: string;

  @IsString()
  code!: string;

  @IsNumber()
  @Min(0)
  discount!: number;

  @IsOptional()
  @IsEnum(CouponStatus)
  status?: CouponStatus;
}
