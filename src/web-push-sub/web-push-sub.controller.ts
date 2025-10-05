// src/web-push-sub/web-push-sub.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { WebPushSubService } from './web-push-sub.service';
import {
  SubscribeWebPushDto,
  UnsubscribeWebPushDto,
} from './dto/web-push-sub.dto';
import { JwtAuthGuard } from 'src/auth/guard/jwt-auth.guard';
import type { AuthRequest } from 'src/common/types/auth-request.type';

@Controller('web-push-sub')
export class WebPushSubController {

  constructor(private readonly push: WebPushSubService) { }

  /* ───────── Public: fetch the VAPID key ───────── */
  @Get('vapid-public-key')
  getVapidKey() {
    return { publicKey: process.env.PUSH_VAPID_PUBLIC_KEY };
  }

  /* ───────── Auth required: store or update a subscription ───────── */
  @UseGuards(JwtAuthGuard)
  @Post('subscribe')
  async subscribe(@Req() req: AuthRequest, @Body() dto: SubscribeWebPushDto) {

    const uid = req?.user?.userId;
    if (!uid) throw new UnauthorizedException('AUTH_REQUIRED');

    await this.push.upsertSubscription(new Types.ObjectId(uid), {
      ...dto,
      userAgent: req.headers['user-agent']?.toString() ?? null,
      ipHint: req.ip ?? null,
    });
    return { ok: true };
  }

  /* ───────── Auth required: deactivate an endpoint ───────── */
  @UseGuards(JwtAuthGuard)
  @Delete('unsubscribe')
  async unsubscribe(
    @Req() req: any,
    @Body() dto: UnsubscribeWebPushDto,
  ) {
    await this.push.deactivateEndpoint(
      new Types.ObjectId(req.user._id),
      dto.endpoint,
    );
    return { ok: true };
  }


}
