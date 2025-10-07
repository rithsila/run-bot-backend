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
import { ApiSuccess } from 'src/common/types/api-response.type';
import { InternalHmacGuard } from 'src/auth/guard/hmac.guard';
import { DeviceHashGuard } from 'src/auth/guard/device-hash-guard';
import { CsrfGuard } from 'src/auth/guard/csrf.guard';
import { JwtAuthGuard } from 'src/auth/guard/jwt-auth.guard';
import { Throttle } from '@nestjs/throttler';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UpdateMembershipDto } from './dto/update-membership.dto';
import { MembershipsPaginateDto } from './dto/memberships-paginate.dto';

@Controller('memberships')
@UseGuards(
    InternalHmacGuard,
    DeviceHashGuard,
    CsrfGuard,
    JwtAuthGuard,
)
export class MembershipsController {
    constructor(private readonly service: MembershipsService) { }

    // @Get()
    // async findAll(
    //     @Req() req: AuthRequest,
    //     @Query()
    //     query: {
    //         page?: number | string;
    //         limit?: number | string;
    //         status?: string;
    //         broker?: string;
    //         user?: string;
    //     },
    // ) {
    //     const data = await this.service.findAll(query);
    //     return {
    //         success: true,
    //         statusCode: HttpStatus.OK,
    //         data,
    //         timestamp: new Date().toISOString(),
    //         path: req.url,
    //     };
    // }

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
    async list(
        @Query(
            new ValidationPipe({
                transform: true,   // applies DTO @Transform to page/limit
                whitelist: true,   // strips unknown query params
                forbidNonWhitelisted: false,
            }),
        )
        q: MembershipsPaginateDto,
    ) {
        // Returns: { items, page, limit, total, totalPages, hasPrevPage, hasNextPage, prevPage, nextPage }
        return this.service.paginate(q);
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
        @Body() body: UpdateStatusDto
    ) {
        const data = await this.service.updateStatus(id, body.status, { reason: body.reason });

        return {
            success: true,
            statusCode: HttpStatus.OK,
            data,
            timestamp: new Date().toISOString(),
            path: req.url,
        };
    }

    @Patch(':id')
    async updateMembership(
        @Req() req: AuthRequest,
        @Param('id') id: string,
        @Body() body: UpdateMembershipDto
    ) {
        const data = await this.service.updateMembership(id, {
            status: body.status,
            adminNotes: body.adminNotes,
            reason: body.reason,
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
