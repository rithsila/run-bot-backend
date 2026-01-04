// src/memberships/memberships.controller.ts
import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    NotFoundException,
    ForbiddenException,
    Param,
    Patch,
    Post,
    Query,
    Req,
    UnauthorizedException,
} from '@nestjs/common';
import type { AuthRequest } from 'src/common/types/auth-request.type';
import type { ApiSuccess } from 'src/common/types/api-response.type';
import { MembershipsService } from './memberships.service';
import { JoinMembershipDto } from './dto/join-membership.dto';
import { MembershipDocument } from './memberships.schema';
import { PaginateMembershipsDto } from './dto/paginate-memberships.dto';
import { Throttle } from '@nestjs/throttler';
import { UpdateMembershipAdminDto } from './dto/update-membership-admin.dto';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Role } from 'src/user/user.enum';
import { ActivateLicenseDto } from './dto/activate-license.dto';
import { Public } from 'src/auth/guard/public.decorator';

interface ActivationResponseData {
    status: string;
    token: string;
}

@Controller('memberships')
export class MembershipsController {
    constructor(private readonly memberships: MembershipsService) { }

    @Get()
    @Roles(Role.Admin)
    @Throttle({ default: { limit: 30, ttl: 60_000 } })
    @HttpCode(HttpStatus.OK)
    async list(@Query() q: PaginateMembershipsDto) {

        return this.memberships.paginate(q);
    }

    @Get('user/:userId')
    @Roles(Role.Admin)
    @HttpCode(HttpStatus.OK)
    async getByUserId(
        @Param('userId') userId: string,
        @Req() req: AuthRequest,
    ): Promise<ApiSuccess<MembershipDocument>> {
        const membership = await this.memberships.findByUserId(userId);
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
    async getMine(@Req() req: AuthRequest) {
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
        await this.memberships.updateAdmin(id, dto, req.user?.userId);
        return {
            success: true,
            statusCode: HttpStatus.OK,
            code: 'MEMBERSHIP_UPDATED',
            message: 'Membership updated',
            timestamp: new Date().toISOString(),
            path: req.url,
        };
    }

    @Post(':id/license')
    @Roles(Role.Admin)
    @Throttle({ default: { limit: 10, ttl: 60_000 } })  // ✅ Rate limit
    @HttpCode(HttpStatus.CREATED)
    async createLicense(
        @Param('id') id: string,
        @Req() req: AuthRequest,
    ): Promise<ApiSuccess<MembershipDocument>> {
        const membership = await this.memberships.createLicenseKeyForMembership(id, req.user?.userId);
        return {
            success: true,
            statusCode: HttpStatus.CREATED,
            code: 'LICENSE_CREATED',
            message: 'License key generated successfully',
            timestamp: new Date().toISOString(),
            path: req.url,
        };
    }

    @Post('activate')
    @Public()
    @HttpCode(HttpStatus.OK)
    async activate(
        @Body() dto: ActivateLicenseDto,
        @Req() req: AuthRequest,
    ): Promise<ApiSuccess<ActivationResponseData>> {
        const xffHeader = req.headers['x-forwarded-for'];
        if (!xffHeader) {
            throw new ForbiddenException('X_FORWARDED_FOR_REQUIRED');
        }
        const xff = Array.isArray(xffHeader) ? xffHeader[0] : xffHeader;
        const ua = req.headers['user-agent'];
        const ip = typeof xff === 'string' && xff.trim() ? xff.split(',')[0].trim() : req.ip;

        const result = await this.memberships.activate(dto, ip, ua ?? undefined);
        return {
            success: true,
            statusCode: HttpStatus.OK,
            code: 'LICENSE_ACTIVATED',
            message: 'License activated successfully',
            data: {
                status: 'OK',
                token: result.token,
            },
            timestamp: new Date().toISOString(),
            path: '/memberships/activate',
        };
    }

    @Post('activate/free')
    @Public()
    @HttpCode(HttpStatus.OK)
    async activateFree(
        @Body() dto: ActivateLicenseDto,
        @Req() req: AuthRequest,
    ): Promise<ApiSuccess<ActivationResponseData>> {
        const xffHeader = req.headers['x-forwarded-for'];
        if (!xffHeader) {
            throw new ForbiddenException('X_FORWARDED_FOR_REQUIRED');
        }
        const xff = Array.isArray(xffHeader) ? xffHeader[0] : xffHeader;
        const ua = req.headers['user-agent'];
        const ip = typeof xff === 'string' && xff.trim() ? xff.split(',')[0].trim() : req.ip;
        console.log('dto==============', dto);
        const result = await this.memberships.activateFreeLicense(dto, ip, ua ?? undefined);
        console.log('result==============', result);
        return {
            success: true,
            statusCode: HttpStatus.OK,
            code: 'LICENSE_ACTIVATED_FREE',
            message: 'Free license activated successfully',
            data: {
                status: 'OK',
                token: result.token,
            },
            timestamp: new Date().toISOString(),
            path: '/memberships/activate/free',
        };
    }
}
