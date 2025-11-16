// src/order/order.controller.ts
import {
  BadRequestException,
  Controller,
  Headers,
  Post,
  Body,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Logger } from 'nestjs-pino';

import { OrderService } from './order.service';
import type { AuthRequest } from 'src/common/types/auth-request.type';
import { UserCreateOrderDto } from './dto/user-create-order.dto';

@Controller('orders')
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly logger: Logger,
  ) {}

  @Post()
  @Throttle({ short: { ttl: 10_000, limit: 5 } })
  async createOrder(
    @Req() req: AuthRequest,
    @Body() dto: UserCreateOrderDto,                              // <- required first
    @Headers('x-idempotency-key') xIdem?: string,                 // <- optional after
    @Headers('idempotency-key') idem?: string,                    // <- optional after
  ) {
    const userId = req?.user?.userId;
    if (!userId) throw new BadRequestException('AUTH_REQUIRED');

    const idempotencyKey = (xIdem || idem || '').trim() || undefined;
    if (idempotencyKey && idempotencyKey.length > 128) {
      throw new BadRequestException('Invalid idempotency key length');
    }

    this.logger.log(
      `Create order: user=${userId} reqId=${(req as any).id} idem=${idempotencyKey ?? 'none'}`,
    );

    return this.orderService.createUserRequestOrder(userId, dto, idempotencyKey);
  }
}
