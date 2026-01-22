// src/memberships/kols-memberships.controller.ts
import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    NotFoundException,
    Post,
    Req,
    UseGuards,
    Param,
} from '@nestjs/common';
import type { AuthRequest } from 'src/common/types/auth-request.type';
import type { ApiSuccess } from 'src/common/types/api-response.type';
import { ApiKeyGuard } from 'src/auth/guard/api-key.guard.ts';
import { Public } from 'src/auth/guard/public.decorator';
import { SkipCsrf } from 'src/auth/guard/skip-csrf.decorator';
import { KolsMembershipService } from './kols-membership.service';
import { KolsJoinMembershipDto } from './dto/kols-join-membership.dto';
import { MembershipDocument } from './memberships.schema';

@Controller('kols/memberships')
@Public()
@SkipCsrf()
@UseGuards(ApiKeyGuard)
export class KolsMembershipsController {
    constructor(private readonly kolsMemberships: KolsMembershipService) { }

    @Get('user/:userId')
    @HttpCode(HttpStatus.OK)
    async getByUserId(
        @Param('userId') userId: string,
        @Req() req: AuthRequest,
    ): Promise<ApiSuccess<MembershipDocument>> {
        const membership = await this.kolsMemberships.findByUserId(userId);
        if (!membership) {
            throw new NotFoundException('MEMBERSHIP_NOT_FOUND');
        }

        return {
            success: true,
            statusCode: HttpStatus.OK,
            code: 'MEMBERSHIP',
            message: 'Membership fetched',
            data: membership,
            timestamp: new Date().toISOString(),
            path: req.url,
        };
    }

    @Post('request')
    @HttpCode(HttpStatus.CREATED)
    async request(
    @Body() dto: KolsJoinMembershipDto,
    @Req() req: AuthRequest,
  ): Promise<ApiSuccess<{ userId: string }>> {
    
        const data = await this.kolsMemberships.requestJoin(dto);

        return {
            success: true,
            statusCode: HttpStatus.CREATED,
            code: 'KOLS_MEMBERSHIP_REQUESTED',
            message: 'KOLs membership request submitted',
            data,
            timestamp: new Date().toISOString(),
            path: req.url,
        };
    }
}
