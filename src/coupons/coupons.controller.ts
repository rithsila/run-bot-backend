// src/coupons/coupons.controller.ts
import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Patch,
    Post,
    Query,
    Req,
    UnauthorizedException,
} from '@nestjs/common';
import { CouponsService } from './coupons.service';
import { CreateCouponRequestDto } from './dto/create-coupon-request.dto';

import type { AuthRequest } from 'src/common/types/auth-request.type';
import type { ApiSuccess, PaginatedResult } from 'src/common/types/api-response.type';
import { CouponStatus } from './coupon.schema';
import { Throttle } from '@nestjs/throttler';
import { PaginateCouponsDto } from './dto/paginate-coupons.dto';
import { UpdateCouponStatusAdminDto } from './dto/update-coupon-status.dto';
import { ApplyCouponDto } from './dto/apply-coupon.dto';

@Controller('coupons')
export class CouponsController {
    constructor(private readonly coupons: CouponsService) { }

    @Get()
    @HttpCode(HttpStatus.OK)
    async list(
        @Query() q: PaginateCouponsDto,
        @Req() req: AuthRequest,
    ): Promise<ApiSuccess<PaginatedResult<any>>> {
        const data = await this.coupons.paginate(q);
        return {
            success: true,
            statusCode: HttpStatus.OK,
            code: 'COUPONS',
            message: 'Coupons fetched',
            data,
            timestamp: new Date().toISOString(),
            path: req.url,
        };
    }

    @Post('request')
    @Throttle({ default: { limit: 3, ttl: 60_000 } })
    @HttpCode(HttpStatus.CREATED)
    async request(
        @Body() dto: CreateCouponRequestDto,
        @Req() req: AuthRequest,
    ): Promise<ApiSuccess> {
        const userId = req.user?.userId;
        if (!userId) throw new UnauthorizedException('AUTH_REQUIRED');

        await this.coupons.request(dto, userId);

        return {
            success: true,
            statusCode: HttpStatus.CREATED,
            code: 'COUPON_REQUESTED',
            message: 'Coupon request submitted',
            timestamp: new Date().toISOString(),
            path: req.url,
        };
    }

    @Get('me/code')
    @HttpCode(HttpStatus.OK)
    async getMyCode(
        @Req() req: AuthRequest
    ): Promise<ApiSuccess<{ code: string; status: CouponStatus; percent: number } | null>> {
        const userId = req.user?.userId;
        if (!userId) throw new UnauthorizedException('AUTH_REQUIRED');

        const coupon = await this.coupons.getCodesByUserId(userId); // one or null

        return {
            success: true,
            statusCode: HttpStatus.OK,
            code: 'COUPON_CODE',
            message: 'Your coupon fetched',
            data: coupon, // { code, status, percent } | null
            timestamp: new Date().toISOString(),
            path: req.url,
        };
    }


    @Patch(':id/status')
    @HttpCode(HttpStatus.OK)
    async updateStatusById(
        @Param('id') id: string,
        @Body() dto: UpdateCouponStatusAdminDto,
        @Req() req: AuthRequest, // keep if you need auth context
    ): Promise<ApiSuccess> {
        await this.coupons.updateStatusById(id, {
            status: dto.status,
            percent: dto.percent,
        });

        return {
            success: true,
            statusCode: HttpStatus.OK,
            code: 'COUPON_UPDATED',
            message: 'Coupon updated',
            timestamp: new Date().toISOString(),
            path: req.url,
        };
    }

    @Post('apply')
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    @HttpCode(HttpStatus.OK)
    async apply(
        @Body() dto: ApplyCouponDto,
        @Req() req: AuthRequest,
    ): Promise<
        ApiSuccess<{
            code: string;
            percent: number;
            owner: { firstName?: string; lastName?: string };
        }>
    > {
        const data = await this.coupons.apply(dto.code);
        return {
            success: true,
            statusCode: HttpStatus.OK,
            code: 'COUPON_APPLIED',
            message: 'Coupon found',
            data,
            timestamp: new Date().toISOString(),
            path: req.url,
        };
    }
}
