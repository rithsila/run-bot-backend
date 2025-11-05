import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsPositive, Max, Min } from 'class-validator';
import { CouponStatus } from '../coupon.schema';

export class PaginateCouponsDto {
  @IsOptional()
  @IsEnum(CouponStatus)
  status?: CouponStatus;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @IsPositive()
  @Min(1)
  @IsOptional()
  page: number = 1;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @IsPositive()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit: number = 10;
}
