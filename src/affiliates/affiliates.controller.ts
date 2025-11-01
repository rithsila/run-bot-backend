import { Controller, Post, Req, HttpCode, HttpStatus, UnauthorizedException, ForbiddenException, Param, NotFoundException, Get } from '@nestjs/common';
import { Types } from 'mongoose';
import { AffiliatesService } from './affiliates.service';
import { MembershipsService } from 'src/referrals/memberships.service';
import type { AuthRequest } from 'src/common/types/auth-request.type';
import { MembershipStatus } from 'src/referrals/memberships.enum';


@Controller('affiliates')
export class AffiliatesController {
    constructor(
        private readonly affiliatesService: AffiliatesService,
        private readonly membershipsService: MembershipsService,
    ) { }

    @Get('me')
    findMe(@Req() req: AuthRequest) {
        const uid = req?.user?.userId;
        if (!uid) throw new UnauthorizedException('AUTH_REQUIRED');
        return this.affiliatesService.getByUserId(new Types.ObjectId(uid));
    }

    @Post('request')
    @HttpCode(HttpStatus.OK)
    async request(@Req() req: AuthRequest) {
        const uid = req?.user?.userId;
        if (!uid) throw new UnauthorizedException('AUTH_REQUIRED');

        // const status = await this.membershipsService.isMembership(new Types.ObjectId(uid));

        if (status !== MembershipStatus.Verified) {
            throw new ForbiddenException('You need a verified membership to request an affiliate.');
        }

        return this.affiliatesService.request(new Types.ObjectId(uid));
    }

    @Post('toggle/:userId')
    @HttpCode(HttpStatus.OK)
    async toggle(@Param('userId') userId: Types.ObjectId) {
        const updated = await this.affiliatesService.toggleAffiliates(userId);
        if (!updated) throw new NotFoundException('User not found');
        return updated;
    }

}
