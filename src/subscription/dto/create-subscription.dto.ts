// src/subscriptions/dto/create-subscription.dto.ts
import {
  IsMongoId,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class CreateSubscriptionDto {
  /**
   * plan: Mongo ObjectId of the plan the user is buying
   * required on frontend and Zod .min(1)
   */
  @IsMongoId({ message: 'Invalid plan id' })
  plan!: string;

  /**
   * bankAccountName: required, 1-120 chars
   * Zod: .min(1).max(120)
   */
  @IsString({ message: 'Bank account is required' })
  @Length(1, 120, {
    message:
      'Bank account must be at least 1 character and at most 120 characters',
  })
  bankAccountName!: string;


  @IsOptional()
  @IsString()
  @Length(1, 60, {
    message:
      'TradingView username must be at least 1 character and at most 60 characters',
  })
  tradingViewUsername?: string;

  /**
   * sn1p3rShotAccount: OPTIONAL
   * Zod: optional string -> trimmed -> undefined if ""
   * Backend: if provided, must be 1-60 chars
   */
  @IsOptional()
  @IsString()
  @Length(1, 60, {
    message:
      'Sn1p3r Shot account must be at least 1 character and at most 60 characters',
  })
  sn1p3rShotAccount?: string;

  /**
   * riskManagerAccount: OPTIONAL
   * same rules as above
   */
  @IsOptional()
  @IsString()
  @Length(1, 60, {
    message:
      'Risk Manager account must be at least 1 character and at most 60 characters',
  })
  riskManagerAccount?: string;

  /**
   * sn1p3rConceptAccount: OPTIONAL
   * same rules as above
   */
  @IsOptional()
  @IsString()
  @Length(1, 60, {
    message:
      'Sn1p3r Concept account must be at least 1 character and at most 60 characters',
  })
  sn1p3rConceptAccount?: string;

  /**
   * couponCode: OPTIONAL
   * Zod couponStrict:
   *  - 2..40 chars
   *  - /^[A-Za-z0-9_\-]+$/
   */
  @IsOptional()
  @IsString()
  @Length(2, 40, {
    message:
      'Coupon must be at least 2 characters and at most 40 characters',
  })
  @Matches(/^[A-Za-z0-9_\-]+$/, {
    message:
      'Coupon can only contain letters, numbers, underscore, and hyphen',
  })
  couponCode?: string;
}
