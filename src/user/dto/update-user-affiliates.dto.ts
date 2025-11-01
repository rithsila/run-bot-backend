// src/user/dto/update-user-affiliates.dto.ts
import { IsEnum } from 'class-validator';
import { AffiliatesStatus } from '../user.enum';

export class UpdateUserAffiliatesDto {
    @IsEnum(AffiliatesStatus)
    affiliates!: AffiliatesStatus;
}
