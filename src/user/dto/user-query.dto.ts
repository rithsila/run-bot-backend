// src/user/dto/user-query.dto.ts
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import {  Role } from '../user.enum';

export class UserQueryDto {
  @IsOptional()
  @IsString()
  q?: string;


  // ✅ new: filter by role
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @Type(() => Number)
  @IsInt() @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt() @Min(1)
  @IsOptional()
  limit?: number = 10;
}
