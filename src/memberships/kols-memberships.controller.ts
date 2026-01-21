// src/memberships/kols-memberships.controller.ts
import {
    Body,
    Controller,
    HttpCode,
    HttpStatus,
    Post,
    Req,
    UseGuards,
} from '@nestjs/common';
import type { AuthRequest } from 'src/common/types/auth-request.type';
import type { ApiSuccess } from 'src/common/types/api-response.type';
import { ApiKeyGuard } from 'src/auth/guard/api-key.guard.ts';
import { Public } from 'src/auth/guard/public.decorator';
import { SkipCsrf } from 'src/auth/guard/skip-csrf.decorator';
import { KolsMembershipService } from './kols-membership.service';
import { KolsJoinMembershipDto } from './dto/kols-join-membership.dto';

@Controller('kols/memberships')
@Public()
@SkipCsrf()
@UseGuards(ApiKeyGuard)
export class KolsMembershipsController {
    constructor(private readonly kolsMemberships: KolsMembershipService) { }

    @Post('request')
    @HttpCode(HttpStatus.CREATED)
    async request(
    @Body() dto: KolsJoinMembershipDto,
    @Req() req: AuthRequest,
  ): Promise<ApiSuccess> {
    
        await this.kolsMemberships.requestJoin(dto);

        return {
            success: true,
            statusCode: HttpStatus.CREATED,
            code: 'KOLS_MEMBERSHIP_REQUESTED',
            message: 'KOLs membership request submitted',
            timestamp: new Date().toISOString(),
            path: req.url,
        };
    }
}
