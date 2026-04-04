// src/referrals/referrals.controller.ts
import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Patch,
    Post,
    Query,
    Req,
    UnauthorizedException,
    ForbiddenException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import type { AuthRequest } from 'src/common/types/auth-request.type';
import type {
    ApiSuccess,
    PaginatedResult,
} from 'src/common/types/api-response.type';

import { ReferralsService } from './referrals.service';

import { Roles } from 'src/auth/decorators/roles.decorator';
import { Role } from 'src/user/user.enum';
import { PaginateReferralsDto } from './dto/paginate-referrals.dto';
import { CreateReferralDto } from './dto/create-referral.dto';

@Controller('referrals')
export class ReferralsController {
    constructor(private readonly referrals: ReferralsService) {}

    @Get()
    @Throttle({ default: { limit: 30, ttl: 60_000 } })
    @HttpCode(HttpStatus.OK)
    async list(
        @Query() q: PaginateReferralsDto,
        @Req() req: AuthRequest,
    ): Promise<ApiSuccess<PaginatedResult<any>>> {
        const data = await this.referrals.paginate(q);

        return {
            success: true,
            statusCode: HttpStatus.OK,
            code: 'REFERRALS',
            message: 'Referrals fetched',
            data,
            timestamp: new Date().toISOString(),
            path: req.url,
        };
    }

    // POST /referrals
    // Admin only: create referral
    @Post()
    @Roles(Role.Admin)
    @HttpCode(HttpStatus.CREATED)
    async create(
        @Body() dto: CreateReferralDto,
        @Req() req: AuthRequest,
    ): Promise<ApiSuccess<any>> {
        const role = req.user?.role;
        if (!role) throw new UnauthorizedException('AUTH_REQUIRED');

        const data = await this.referrals.createReferral(dto, role);

        return {
            success: true,
            statusCode: HttpStatus.CREATED,
            code: 'REFERRAL_CREATED',
            message: 'Referral created',
            data,
            timestamp: new Date().toISOString(),
            path: req.url,
        };
    }

    // PATCH /referrals/:id
    // Admin only: update referral
    @Patch(':id')
    @Roles(Role.Admin)
    @HttpCode(HttpStatus.OK)
    async update(
        @Param('id') id: string,
        @Body() dto: CreateReferralDto,
        @Req() req: AuthRequest,
    ): Promise<ApiSuccess<any>> {
        const data = await this.referrals.updateReferralById(id, dto);

        return {
            success: true,
            statusCode: HttpStatus.OK,
            code: 'REFERRAL_UPDATED',
            message: 'Referral updated',
            data,
            timestamp: new Date().toISOString(),
            path: req.url,
        };
    }

    // DELETE /referrals/:id
    // Admin only: delete referral
    @Delete(':id')
    @Roles(Role.Admin)
    @HttpCode(HttpStatus.OK)
    async remove(
        @Param('id') id: string,
        @Req() req: AuthRequest,
    ): Promise<ApiSuccess> {
        const role = req.user?.role;
        if (!role) throw new UnauthorizedException('AUTH_REQUIRED');

        await this.referrals.deleteReferralById(id, role);

        return {
            success: true,
            statusCode: HttpStatus.OK,
            code: 'REFERRAL_DELETED',
            message: 'Referral deleted',
            timestamp: new Date().toISOString(),
            path: req.url,
        };
    }

    // GET /referrals/owner/:ownerId
    // Get one by owner (owner themself OR admin)
    @Get('owner/:ownerId')
    @HttpCode(HttpStatus.OK)
    async getByOwner(
        @Param('ownerId') ownerId: string,
        @Req() req: AuthRequest,
    ): Promise<ApiSuccess<any>> {
        const user = req.user;
        if (!user) throw new UnauthorizedException('AUTH_REQUIRED');

        // Allow admin OR the owner themself
        const isOwner = user.userId === ownerId;
        const isAdmin = user.role === Role.Admin;

        if (!isOwner && !isAdmin) {
            throw new ForbiddenException('FORBIDDEN');
        }

        const data = await this.referrals.getByOwner(ownerId);

        return {
            success: true,
            statusCode: HttpStatus.OK,
            code: 'REFERRAL',
            message: 'Referral fetched',
            data,
            timestamp: new Date().toISOString(),
            path: req.url,
        };
    }
}
