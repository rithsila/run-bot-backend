// src/memberships/dto/activate-license.dto.ts
import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class ActivateLicenseDto {
    @IsString()
    @IsNotEmpty()
    key: string;          // membership.licenseKey

    @IsNumber()
    @Min(1)
    accountLogin: number; // MT5 AccountInfoInteger(ACCOUNT_LOGIN)
}
