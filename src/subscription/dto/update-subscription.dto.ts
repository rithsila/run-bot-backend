// src/subscriptions/dto/update-subscription.dto.ts
import {
    IsEnum,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
} from 'class-validator';
import type { SubscriptionStatus } from '../subscription.schema';

export class UpdateSubscriptionDto {
   
    @IsOptional()
    @IsEnum(['active', 'past_due', 'paused', 'cancelled'], {
        message:
            "status must be one of 'active' | 'past_due' | 'paused' | 'cancelled'",
    })
    status?: SubscriptionStatus;

  
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(120)
    sn1p3rConceptKey?: string;

  
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(120)
    riskManagerKey?: string;

  
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(120)
    sn1p3rShotKey?: string;

 
    @IsOptional()
    @IsString()
    noted?: string;
}
