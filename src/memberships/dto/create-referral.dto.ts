// src/referrals/dto/create-referral.dto.ts
import { IsMongoId, IsString, IsUrl } from 'class-validator';

export class CreateReferralDto {
    @IsMongoId()
    ownerId: string;

    @IsUrl()
    link: string;

    @IsString()
    code: string;
}
