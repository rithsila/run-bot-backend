// src/trading-plans/trading-plan.controller.ts
import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Post,
    Req,
    UnauthorizedException,
    UsePipes,
    ValidationPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { TradingPlanService } from './trading-plan.service';
import { CreateTradingPlanDto } from './dto/create-trading-plan.dto';
import type { AuthRequest } from 'src/common/types/auth-request.type';
import { ApiSuccess } from 'src/common/types/api-response.type';

@Controller('trading-plan')
export class TradingPlanController {
    constructor(private readonly service: TradingPlanService) { }
    @Post()
    @HttpCode(HttpStatus.CREATED)
    @Throttle({ default: { limit: 5, ttl: 30_000 } })
    @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    async create(
        @Req() req: AuthRequest,
        @Body() dto: CreateTradingPlanDto,
    ): Promise<ApiSuccess<unknown>> {
        const uid = req?.user?.userId;
        if (!uid) throw new UnauthorizedException('AUTH_REQUIRED');
        const plan = await this.service.create(uid, dto);
        return {
            success: true,
            statusCode: HttpStatus.CREATED,
            timestamp: new Date().toISOString(),
            path: req.url,
            code: 'CREATE_TRADING_PLAN',
            message: 'Success!',
            data: plan,
        };
    }

    
    @Get()
    @HttpCode(HttpStatus.OK)
    async findMine(@Req() req: AuthRequest): Promise<ApiSuccess<unknown[]>> {
        const items = await this.service.findAll();

        return {
            success: true,
            statusCode: HttpStatus.OK,
            timestamp: new Date().toISOString(),
            path: req.url,
            code: 'LIST_TRADING_PLANS',
            message: 'Success!',
            data: items,
        };
    }

    @Get(':id')
    @HttpCode(HttpStatus.OK)
    async findOne(
        @Req() req: AuthRequest,
        @Param('id') id: string,
    ): Promise<ApiSuccess<unknown>> {
        const uid = req?.user?.userId;
        if (!uid) throw new UnauthorizedException('AUTH_REQUIRED');

        const plan = await this.service.findById(id);

        return {
            success: true,
            statusCode: HttpStatus.OK,
            timestamp: new Date().toISOString(),
            path: req.url,
            code: 'GET_TRADING_PLAN',
            message: 'Success!',
            data: plan,
        };
    }
}
