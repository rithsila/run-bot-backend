// src/memberships/memberships.controller.ts
import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    NotFoundException,
    Param,
    Patch,
    Post,
    Query,
    Req,
    UnauthorizedException,
} from '@nestjs/common';
import type { AuthRequest } from 'src/common/types/auth-request.type';
import type { ApiSuccess, PaginatedResult } from 'src/common/types/api-response.type';
import { MembershipsService } from './memberships.service';
import { JoinMembershipDto } from './dto/join-membership.dto';
import { MembershipDocument } from './memberships.schema';
import { PaginateMembershipsDto } from './dto/paginate-memberships.dto';
import { Throttle } from '@nestjs/throttler';
import { UpdateMembershipAdminDto } from './dto/update-membership-admin.dto';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Role } from 'src/user/user.enum';

@Controller('memberships')
export class MembershipsController {
    constructor(private readonly memberships: MembershipsService) { }

    @Get()
    @Roles(Role.Admin)
    @Throttle({ default: { limit: 30, ttl: 60_000 } })
    @HttpCode(HttpStatus.OK)
    async list(
        @Query() q: PaginateMembershipsDto,
        @Req() req: AuthRequest,
    ): Promise<ApiSuccess<PaginatedResult<any>>> {
        const data = await this.memberships.paginate(q);
        return {
            success: true,
            statusCode: HttpStatus.OK,
            code: 'MEMBERSHIPS',
            message: 'Memberships fetched',
            data,
            timestamp: new Date().toISOString(),
            path: req.url,
        };
    }

    @Post('request')
    @HttpCode(HttpStatus.CREATED)
    async request(
        @Body() dto: JoinMembershipDto,
        @Req() req: AuthRequest,
    ): Promise<ApiSuccess> {
        const userId = req.user?.userId;
        await this.memberships.requestJoin(dto, userId);

        return {
            success: true,
            statusCode: HttpStatus.CREATED,
            code: 'MEMBERSHIP_REQUESTED',
            message: 'Membership request submitted',
            timestamp: new Date().toISOString(),
            path: req.url,
        };
    }

    @Get('me')
    @HttpCode(HttpStatus.OK)
    async getMine(@Req() req: AuthRequest): Promise<ApiSuccess<MembershipDocument>> {
        const userId = req.user?.userId;

        if (!userId) throw new UnauthorizedException('AUTH_REQUIRED');
        const membership = await this.memberships.findByUserId(userId);

        if (!membership) throw new NotFoundException('MEMBERSHIP_NOT_FOUND');

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

    @Post('appeal')
    @HttpCode(HttpStatus.OK)
    async appeal(
        @Body() dto: JoinMembershipDto,
        @Req() req: AuthRequest,
    ): Promise<ApiSuccess> {
        const userId = req.user?.userId;
        if (!userId) throw new UnauthorizedException('AUTH_REQUIRED');

        await this.memberships.appeal(userId, dto);

        return {
            success: true,
            statusCode: HttpStatus.OK,
            code: 'MEMBERSHIP_APPEALED',
            message: 'Membership appeal submitted',
            timestamp: new Date().toISOString(),
            path: req.url,
        };
    }

    @Patch(':id/admin')
    @Roles(Role.Admin)
    @HttpCode(HttpStatus.OK)
    async adminUpdate(
        @Param('id') id: string,
        @Body() dto: UpdateMembershipAdminDto,
        @Req() req: AuthRequest,
    ): Promise<ApiSuccess> {
        await this.memberships.updateAdmin(id, dto);
        return {
            success: true,
            statusCode: HttpStatus.OK,
            code: 'MEMBERSHIP_UPDATED',
            message: 'Membership updated',
            timestamp: new Date().toISOString(),
            path: req.url,
        };
    }
}
