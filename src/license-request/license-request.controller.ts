// src/license-requests/license-request.controller.ts
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
import { LicenseRequestService } from './license-request.service';
import type { AuthRequest } from 'src/common/types/auth-request.type';
import { ApiSuccess, PaginatedResult } from 'src/common/types/api-response.type';
import { InternalHmacGuard } from 'src/auth/guard/hmac.guard';
import { DeviceHashGuard } from 'src/auth/guard/device-hash-guard';
import { CsrfGuard } from 'src/auth/guard/csrf.guard';
import { JwtAuthGuard } from 'src/auth/guard/jwt-auth.guard';
import { Throttle } from '@nestjs/throttler';
import { CreateLicenseRequestDto } from './dto/create-license-request.dto';
import { LicenseRequestsPaginateDto } from './dto/license-requests-paginate.dto';
import { AdminUpdateLicenseRequestDto } from './dto/admin-update-license-request.dto';
import { Types } from 'mongoose';

export type LicenseRequestLean = Record<string, any>;
type LicenseRequestPage = PaginatedResult<LicenseRequestLean>;

@Controller('license-requests')
@UseGuards(InternalHmacGuard, DeviceHashGuard, CsrfGuard, JwtAuthGuard)
export class LicenseRequestController {
    constructor(private readonly service: LicenseRequestService) { }

    @Post('request')
    @HttpCode(HttpStatus.CREATED)
    @Throttle({ default: { limit: 5, ttl: 30_000 } })
    async request(
        @Req() req: AuthRequest,
        @Body(new ValidationPipe({ transform: true, whitelist: true }))
        dto: CreateLicenseRequestDto,
    ): Promise<ApiSuccess> {
        const uid = req?.user?.userId;
        if (!uid) throw new UnauthorizedException('AUTH_REQUIRED');

        await this.service.requestLicense(new Types.ObjectId(uid), dto);

        return {
            success: true,
            statusCode: HttpStatus.CREATED,
            timestamp: new Date().toISOString(),
            path: req.url,
            code: 'LICENSE_REQUEST',
            message: 'Success!',
        };
    }

    @Get()
    @Throttle({ default: { limit: 20, ttl: 60_000 } })
    async list(
        @Req() req: AuthRequest,
        @Query(new ValidationPipe({ transform: true, whitelist: true }))
        q: LicenseRequestsPaginateDto,
    ): Promise<ApiSuccess<LicenseRequestPage>> {
        const data = await this.service.paginate(q);
        return {
            success: true,
            statusCode: HttpStatus.OK,
            code: 'LICENSE_REQUESTS_LIST',
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

        const data = await this.service.myLicenseRequest(new Types.ObjectId(uid));
        return {
            success: true,
            statusCode: HttpStatus.OK,
            data,
            timestamp: new Date().toISOString(),
            path: req.url,
        };
    }


    @Patch('status/:id')
    async adminUpdateById(
        @Param('id') id: Types.ObjectId,
        @Body(new ValidationPipe({
            transform: true,
            whitelist: true,
            forbidNonWhitelisted: false, // ⬅️ override global
        }))
        dto: AdminUpdateLicenseRequestDto,
    ) {
        return this.service.adminUpdateById(id, dto);
    }

    @Patch(':id')
    async updateMyRequest(
        @Req() req: AuthRequest,
        @Param('id') id: string,
        @Body(new ValidationPipe({ transform: true, whitelist: true }))
        dto: CreateLicenseRequestDto,
    ) {

        await this.service.updateMyRequest(id, dto);

        return {
            success: true,
            statusCode: HttpStatus.OK,
            timestamp: new Date().toISOString(),
            path: req.url,
        };
    }
}
