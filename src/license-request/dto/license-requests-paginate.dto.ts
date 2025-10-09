// src/license-requests/dto/license-requests-paginate.dto.ts
import { IsOptional, IsEnum, IsInt, Min, IsString, MaxLength } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { MembershipStatus } from 'src/referrals/memberships.enum';

export class LicenseRequestsPaginateDto {
  @IsOptional()
  @IsEnum(MembershipStatus)
  status?: MembershipStatus;

  // free-text search across bankAccountName & tradingViewUsername
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  // If you want to filter by the current user (for "my requests"),
  // resolve userId from auth in your service; don't trust client input.
}
