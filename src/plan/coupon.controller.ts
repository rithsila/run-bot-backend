// src/coupons/coupon.controller.ts
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
    UsePipes,
    ValidationPipe,
} from '@nestjs/common';
import { CouponService } from './coupon.service';
import { CreateCouponDto } from './dto/create-coupon.dto';

@Controller('coupon')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class CouponController {
    constructor(private readonly coupons: CouponService) { }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    create(@Body() dto: CreateCouponDto) {
        return this.coupons.create(dto);
    }

    @Get()
    list() {
        return this.coupons.findAll();
    }

    @Post('code')
    @HttpCode(HttpStatus.OK)
    getByCode(@Body('code') code: string) {
        return this.coupons.findByCode(code);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: CreateCouponDto) {
        return this.coupons.update(id, dto);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    async remove(@Param('id') id: string) {
        await this.coupons.remove(id);
    }
}
