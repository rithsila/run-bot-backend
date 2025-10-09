// src/license-requests/dto/create-license-request.dto.ts
import { IsOptional, IsString, MaxLength, MinLength, Matches, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';

const ACCOUNT_RX = /^[A-Za-z0-9._-]{3,50}$/;
const TV_RX = /^[a-z0-9._-]{3,60}$/;

export class CreateLicenseRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(ACCOUNT_RX, { message: 'accountRiskManager must be 3–50 chars, alphanumeric plus . _ - only' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  accountRiskManager?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(ACCOUNT_RX, { message: 'accountSn1p3rConcept must be 3–50 chars, alphanumeric plus . _ - only' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  accountSn1p3rConcept?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(ACCOUNT_RX, { message: 'accountSn1p3rShot must be 3–50 chars, alphanumeric plus . _ - only' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  accountSn1p3rShot?: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  bankAccountName!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(60)
  @Matches(TV_RX, { message: 'tradingViewUsername must be 3–60 chars, lowercase letters/numbers/._- only' })
  @Transform(({ value }) => (typeof value === 'string' ? String(value).trim().toLowerCase() : value))
  tradingViewUsername!: string;

  // User-provided notes (optional)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  notes?: string;
}
