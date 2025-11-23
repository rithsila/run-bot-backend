import { BadRequestException, Controller, Get, Param, Req } from '@nestjs/common';
import type { AuthRequest } from 'src/common/types/auth-request.type';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get('me')
  getMySubscriptions(@Req() req: AuthRequest) {
    const userId = req?.user?.userId;
    if (!userId) throw new BadRequestException('AUTH_REQUIRED');
    return this.subscriptions.getByUser(userId);
  }
}
