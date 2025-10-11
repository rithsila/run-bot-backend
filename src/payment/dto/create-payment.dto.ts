import { IsEnum, IsInt, IsMongoId, IsOptional, IsString, IsDateString, Min } from 'class-validator';
import { PaymentMethod, PaymentStatus } from '../payments.enum';

export class CreatePaymentDto {
    /** Integer in your smallest unit (e.g., cents/riel) */
    @IsInt()
    @Min(0)
    amount!: number;

    /** e.g., MobileWallet | BankTransfer | Card | QR | Cash | Crypto */
    @IsEnum(PaymentMethod)
    method!: PaymentMethod;

    /** Optional initial status (schema defaults to Initiated) */
    @IsOptional()
    @IsEnum(PaymentStatus)
    status?: PaymentStatus;

    /** Optional Plan reference */
    @IsOptional()
    @IsMongoId()
    plan?: string;

    /** Optional ISO 8601 date string; if provided, set as hold/session expiry */
    @IsOptional()
    @IsDateString()
    expiresAt?: string;

    /** Optional for logging; you can also fill from req.ip */
    @IsOptional()
    @IsString()
    ipAddress?: string;
}
