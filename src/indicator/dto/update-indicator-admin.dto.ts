// src/indicator/dto/update-indicator-admin.dto.ts
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { IndicatorStatus } from '../indicator.schema';

export class UpdateIndicatorAdminDto {
  @IsOptional()
  @IsEnum(IndicatorStatus)
  status?: IndicatorStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  adminNotes?: string;
}
