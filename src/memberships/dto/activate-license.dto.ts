// src/memberships/dto/activate-license.dto.ts
import { IsNotEmpty, IsString, } from 'class-validator';

export class ActivateLicenseDto {
    @IsString()
    @IsNotEmpty()
    key: string;          // membership.licenseKey

    @IsString()
    accountLogin: string; // MT5 AccountInfoInteger(ACCOUNT_LOGIN)
}
