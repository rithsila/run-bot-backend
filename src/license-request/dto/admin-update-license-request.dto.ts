// src/license-requests/dto/admin-update-license-request.dto.ts
// For admin to set status, notes, and license keys on review/approval.
import { IsOptional, IsString, MaxLength, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';
import { MembershipStatus } from 'src/referrals/memberships.enum';

export class AdminUpdateLicenseRequestDto {
    @IsOptional()
    @IsEnum(MembershipStatus, {
        message: `status must be one of: ${Object.values(MembershipStatus).join(', ')}`,
    })
    status?: MembershipStatus;

    // License keys (admin-set)
    @IsOptional()
    @IsString()
    @MaxLength(120)
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    licenseRiskManager?: string;

    @IsOptional()
    @IsString()
    @MaxLength(120)
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    licenseSn1p3rConcept?: string;

    @IsOptional()
    @IsString()
    @MaxLength(120)
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    licenseSn1p3rShot?: string;

    // Admin notes
    @IsOptional()
    @IsString()
    @MaxLength(500)
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    adminNotes?: string;

}
