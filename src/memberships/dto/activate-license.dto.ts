// src/memberships/dto/activate-license.dto.ts
import { IsNotEmpty, IsString, Min } from 'class-validator';

export class ActivateLicenseDto {
    @IsString()
    @IsNotEmpty()
    key: string;          // membership.licenseKey

    @IsString()
    @Min(1)
    accountLogin: string; // MT5 AccountInfoInteger(ACCOUNT_LOGIN)
}
