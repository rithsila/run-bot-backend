// src/marketplace/dto/create-product.dto.ts
import {
  IsBoolean,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateProductDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  features?: string;

  // NEW: optional internal note
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  note?: string;

  @IsInt()
  @Min(0)
  @Transform(({ value }) => Number(value))
  billingPeriod!: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) =>
    value === '' || value === undefined || value === null ? false : value === 'true' || value === true
  )
  lifetime?: boolean;

  @IsMongoId()
  category!: string;

  @IsNumber()
  @Min(0)
  @Transform(({ value }) => (value === '' || value === null ? value : Number(value)))
  pricing!: number;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @Transform(({ value }) => (value === '' ? undefined : value))
  payURL?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @Transform(({ value }) => (value === '' ? undefined : value))
  discountPayURL?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) =>
    value === '' || value === undefined || value === null ? false : value === 'true' || value === true
  )
  allowCoupon?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Transform(({ value }) =>
    value === '' || value === undefined || value === null ? 0 : Number(value)
  )
  discount?: number;

  /** ---------- Checklist flags (optional) ---------- */
  @IsOptional()
  @IsBoolean()
  tvUsernameAck?: boolean;

  @IsOptional()
  @IsBoolean()
  accountSnapshotAck?: boolean;

  @IsOptional()
  @IsBoolean()
  accountConceptAck?: boolean;

  @IsOptional()
  @IsBoolean()
  riskManagementAck?: boolean;
}
