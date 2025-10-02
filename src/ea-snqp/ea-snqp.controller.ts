// src/ea-snqp/ea-snqp.controller.ts
import {
    Controller,
    Get,
    Post,
    Body,
    Query,
    Req,
    UnauthorizedException,
    HttpStatus,
    UsePipes,
    ValidationPipe,
} from '@nestjs/common';
import { EaSnqpService } from './ea-snqp.service';
import { MembershipStatus } from 'src/referrals/memberships.enum';
import { RequestSnqpDto } from './dto/request-snqp.dto';
import type { AuthRequest } from 'src/common/types/auth-request.type';
import { Throttle } from '@nestjs/throttler';

@Controller('ea-snqp')
export class EaSnqpController {
    constructor(private readonly service: EaSnqpService) { }

    @Post('request')
    @Throttle({ default: { limit: 3, ttl: 60_000 } })
    @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
    async requestSnqp(@Req() req: AuthRequest, @Body() body: RequestSnqpDto) {
        const uid = req?.user?.userId;
        if (!uid) throw new UnauthorizedException('AUTH_REQUIRED');
        const data = await this.service.requestSnqp(uid, body);
        return {
            success: true,
            statusCode: HttpStatus.CREATED,
            data,
            timestamp: new Date().toISOString(),
            path: req.url,
        };
    }

    @Get('me')
    async mySnqp(@Req() req: AuthRequest, @Query('status') status?: MembershipStatus) {
        const uid = req?.user?.userId;
        if (!uid) throw new UnauthorizedException('AUTH_REQUIRED');
        const data = await this.service.mySnqp(uid, status);
        return {
            success: true,
            statusCode: HttpStatus.OK,
            data,
            timestamp: new Date().toISOString(),
            path: req.url,
        };
    }
}
