// dto/update-status.dto.ts
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { MembershipStatus } from '../memberships.enum';

export class UpdateStatusDto {
    @IsEnum(MembershipStatus)
    status!: MembershipStatus;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    reason?: string;
}