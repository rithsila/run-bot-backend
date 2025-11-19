// src/memberships/dto/activate-license.dto.ts
import { IsNotEmpty, IsString, } from 'class-validator';

export class ActivateLicenseDto {
    @IsString()
    @IsNotEmpty()
    key: string;   
           
    @IsString()
    accountLogin: string; 
}
