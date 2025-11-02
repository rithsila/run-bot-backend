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
    ValidationPipe,
} from '@nestjs/common';
import { MembershipsService } from './memberships.service';
import type { AuthRequest } from 'src/common/types/auth-request.type';
import { ApiSuccess, PaginatedResult } from 'src/common/types/api-response.type';
import { InternalHmacGuard } from 'src/auth/guard/hmac.guard';
import { DeviceHashGuard } from 'src/auth/guard/device-hash-guard';
import { CsrfGuard } from 'src/auth/guard/csrf.guard';
import { JwtAuthGuard } from 'src/auth/guard/jwt-auth.guard';
import { Throttle } from '@nestjs/throttler';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { MembershipsPaginateDto } from './dto/memberships-paginate.dto';
import { UpdateMembershipDto } from './dto/update-membership.dto';

export type MembershipLean = Record<string, any>;
type MembershipPage = PaginatedResult<MembershipLean>;

@Controller('memberships')
@UseGuards(
    InternalHmacGuard,
    DeviceHashGuard,
    CsrfGuard,
    JwtAuthGuard,
)
export class MembershipsController {

    constructor(private readonly service: MembershipsService) { }

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

    @Get()
    @Throttle({ default: { limit: 20, ttl: 60_000 } })
    async list(
        @Req() req: AuthRequest,
        @Query(new ValidationPipe({ transform: true, whitelist: true }))
        q: MembershipsPaginateDto,
    ): Promise<ApiSuccess<MembershipPage>> {
        const data = await this.service.paginate(q);
        return {
            success: true,
            statusCode: HttpStatus.OK,
            code: 'MEMBERSHIPS_LIST',
            message: 'OK',
            timestamp: new Date().toISOString(),
            path: req.url,
            data,
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

    @Patch('status/:id')
    async updateById(
        @Param('id') id: string,
        @Body(new ValidationPipe({ transform: true, whitelist: true }))
        dto: UpdateMembershipDto, // or UpdateStatusDto if you prefer status-only DTO
    ) {
        return this.service.updateById(id, dto);
    }

    @Patch(':id')
    async updateMembership(
        @Req() req: AuthRequest,
        @Param('id') id: string,
        @Body() body: CreateMembershipDto
    ) {
        const data = body;
        await this.service.updateMembership(id, data);
        return {
            success: true,
            statusCode: HttpStatus.OK,
            timestamp: new Date().toISOString(),
            path: req.url,
        };
    }
}