// src/ea-snqp/dto/update-snqp-status.dto.ts
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { MembershipStatus } from 'src/referrals/memberships.enum';

export class UpdateSnqpStatusDto {
    @IsEnum(MembershipStatus, {
        message: 'status must be one of MembershipStatus',
    })
    status!: MembershipStatus;

    // required when status is Verified – frontend always sends it
    @IsOptional()
    @IsString()
    license: string;
}
