import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  Length,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateMembershipDto {
  @IsEmail()
  @MaxLength(120)
  @Transform(({ value }) => String(value).trim().toLowerCase())
  email!: string;

  @IsString()
  referral!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(1, 60, {
    message:
      'Sn1p3r Concept account must be 1 to 60 characters long',
  })
  @Matches(/^[A-Za-z0-9._-]+$/, {
    message:
      'Sn1p3r Concept account may only contain letters, numbers, dot, underscore, and hyphen',
  })
  sn1p3rConceptAccount?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(1, 60, {
    message:
      'Risk Manager account must be 1 to 60 characters long',
  })
  @Matches(/^[A-Za-z0-9._-]+$/, {
    message:
      'Risk Manager account may only contain letters, numbers, dot, underscore, and hyphen',
  })
  riskManagerAccount?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(1, 60, {
    message:
      'Sn1p3r Shot account must be 1 to 60 characters long',
  })
  @Matches(/^[A-Za-z0-9._-]+$/, {
    message:
      'Sn1p3r Shot account may only contain letters, numbers, dot, underscore, and hyphen',
  })
  sn1p3rShotAccount?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
