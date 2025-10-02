// src/memberships/memberships.controller.ts
import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Req,
    UnauthorizedException,
    HttpStatus,
    Query,
    Patch,
    UseGuards,
    HttpCode,
} from '@nestjs/common';
import { MembershipsService } from './memberships.service';
import type { AuthRequest } from 'src/common/types/auth-request.type';
import { ApiSuccess } from 'src/common/types/api-response.type';
import { InternalHmacGuard } from 'src/auth/guard/hmac.guard';
import { DeviceHashGuard } from 'src/auth/guard/device-hash-guard';
import { CsrfGuard } from 'src/auth/guard/csrf.guard';
import { JwtAuthGuard } from 'src/auth/guard/jwt-auth.guard';
import { Throttle } from '@nestjs/throttler';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { MembershipStatus } from './memberships.enum';

@Controller('memberships')
@UseGuards(
    InternalHmacGuard,
    DeviceHashGuard,
    CsrfGuard,
    JwtAuthGuard,
)
export class MembershipsController {
    constructor(private readonly service: MembershipsService) { }

    @Get()
    async findAll(
        @Req() req: AuthRequest,
        @Query()
        query: {
            page?: number | string;
            limit?: number | string;
            status?: string;
            broker?: string;
            user?: string;
        },
    ) {
        const data = await this.service.findAll(query);
        return {
            success: true,
            statusCode: HttpStatus.OK,
            data,
            timestamp: new Date().toISOString(),
            path: req.url,
        };
    }

    @Post('join')
    @HttpCode(HttpStatus.CREATED)
    @Throttle({ default: { limit: 5, ttl: 30_000 } })
    async join(
        @Req() req: AuthRequest,
        @Body() dto: CreateMembershipDto,
    ): Promise<ApiSuccess> {
        const uid = req?.user?.userId;
        if (!uid) throw new UnauthorizedException('AUTH_REQUIRED');

        await this.service.requestJoin(uid, dto);

        return {
            success: true,
            statusCode: HttpStatus.CREATED,
            timestamp: new Date().toISOString(),
            path: req.url,
            code: 'JOIN_MEMBERSHIP',
            message: 'Success!',
        };
    }

    @Get('me')
    async mine(@Req() req: AuthRequest) {
        const uid = req?.user?.userId;
        if (!uid) throw new UnauthorizedException('AUTH_REQUIRED');

        const data = await this.service.myMemberships(uid);
        return {
            success: true,
            statusCode: HttpStatus.OK,
            data,
            timestamp: new Date().toISOString(),
            path: req.url,
        };
    }

    @Patch(':id/status')
    async setStatus(
        @Req() req: AuthRequest,
        @Param('id') id: string,
        @Body() body: { status?: MembershipStatus; brokerAccountId?: string; notes?: string }
    ) {
        const uid = req?.user?.userId;
        if (!uid) throw new UnauthorizedException('AUTH_REQUIRED');

        const data = await this.service.updateStatus(id, uid, body.status as MembershipStatus, {
            brokerAccountId: body?.brokerAccountId,
            notes: body?.notes,
        });

        return {
            success: true,
            statusCode: HttpStatus.OK,
            data,
            timestamp: new Date().toISOString(),
            path: req.url,
        };
    }

}
