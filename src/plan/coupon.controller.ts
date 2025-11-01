// src/coupons/coupon.controller.ts
import {
    Body,
    Controller,
    Get,
    HttpCode,
    NotFoundException,
    Param,
    Post,
    Req,
    UnauthorizedException,
    UsePipes,
    ValidationPipe,
} from '@nestjs/common';
import { CouponService } from './coupon.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { Coupon } from './coupon.schema';
import type { AuthRequest } from 'src/common/types/auth-request.type';
import { Types } from 'mongoose';

@Controller('coupons')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class CouponController {

    constructor(private readonly couponService: CouponService) { }

    @Post('upsert')
    @HttpCode(200)
    async upsertByCode(@Req() req: AuthRequest, @Body() dto: CreateCouponDto): Promise<Coupon> {

        const ownerId = req?.user?.userId;
        if (!ownerId) throw new UnauthorizedException('AUTH_REQUIRED');

        return this.couponService.upsertByCode(new Types.ObjectId(ownerId), dto);
    }

    @Post('find')
    async findByCode(@Body('code') code: string): Promise<Coupon> {
        const coupon = await this.couponService.findByCode(code);
        if (!coupon) {
            throw new NotFoundException('Coupon not found');
        }
        return coupon;
    }

    @Get('me')
    async getMyCoupon(@Req() req: AuthRequest): Promise<Coupon | null> {
        const userId = req?.user?.userId;
        if (!userId) throw new NotFoundException('Missing user id');
        const coupon = await this.couponService.findByOwner(userId);
        if (!coupon) throw new NotFoundException('You have no coupon yet');
        return coupon;
    }
}
