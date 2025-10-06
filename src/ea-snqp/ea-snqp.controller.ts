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
    ForbiddenException,
    HttpException,
    Patch,
    Param,
} from '@nestjs/common';
import { EaSnqpService } from './ea-snqp.service';
import { MembershipStatus } from 'src/referrals/memberships.enum';
import { RequestSnqpDto } from './dto/request-snqp.dto';
import type { AuthRequest } from 'src/common/types/auth-request.type';
import { Throttle } from '@nestjs/throttler';
import { MembershipsService } from 'src/referrals/memberships.service';
import { GetAllSnqpDto } from './dto/get-all-snqp.dto';
import { UpdateSnqpStatusDto } from './dto/update-snqp-status.dto';

@Controller('ea-snqp')
export class EaSnqpController {
    constructor(
        private readonly service: EaSnqpService,
        private readonly memberships: MembershipsService
    ) { }

    @Get('all')
    @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
    async getAll(@Req() req: Request, @Query() query: GetAllSnqpDto) {
        const data = await this.service.getAll(query);
        return {
            success: true,
            statusCode: HttpStatus.OK,
            data,
            timestamp: new Date().toISOString(),
            path: req.url,
        };
    }

    @Post('request')
    @Throttle({ default: { limit: 3, ttl: 60_000 } })
    @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
    async requestSnqp(@Req() req: AuthRequest, @Body() body: RequestSnqpDto) {
        const uid = req?.user?.userId;
        if (!uid) throw new UnauthorizedException('AUTH_REQUIRED');

        const my = await this.memberships.myMemberships(uid);

        if (!my?.length) {
            throw new ForbiddenException({
                error: 'MEMBERSHIP_REQUIRED',
                message: 'You need to register a membership first.',
                action: 'REGISTER_MEMBERSHIP',
                path: req.url,
                statusCode: HttpStatus.FORBIDDEN,
                timestamp: new Date().toISOString(),
            });
        }

        // 2) (Optional) Require ACTIVE membership
        const active = my.find(m => m.status === MembershipStatus.Verified);
        if (!active) {
            // If you want different messaging for pending/expired, split cases here:
            const pending = my.find(m => m.status === MembershipStatus.Request);
            if (pending) {
                throw new HttpException({
                    error: 'MEMBERSHIP_PENDING',
                    message: 'Your membership is pending approval.',
                    action: 'WAIT_OR_CONTACT_SUPPORT',
                    path: req.url,
                    statusCode: HttpStatus.FORBIDDEN,
                    timestamp: new Date().toISOString(),
                }, HttpStatus.FORBIDDEN);
            }

            throw new HttpException({
                error: 'MEMBERSHIP_INACTIVE',
                message: 'Your membership is not active. Please renew or contact support.',
                action: 'RENEW_MEMBERSHIP',
                path: req.url,
                statusCode: HttpStatus.FORBIDDEN,
                timestamp: new Date().toISOString(),
            }, HttpStatus.FORBIDDEN);
        }

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

    @Patch(':id/status')
    @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
    async updateStatus(
        @Req() req: AuthRequest,
        @Param('id') id: string,
        @Body() body: UpdateSnqpStatusDto,
    ) {
        const uid = req?.user?.userId;
        if (!uid) throw new UnauthorizedException('AUTH_REQUIRED');

        const data = await this.service.updateStatus(id, uid, body);
        return {
            success: true,
            statusCode: HttpStatus.OK,
            data,
            timestamp: new Date().toISOString(),
            path: req.url,
        };
    }
}
