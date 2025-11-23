// src/order/order.controller.ts
import {
  BadRequestException,
  Controller,
  Headers,
  Post,
  Body,
  Req,
  Get,
  Query,
  Param,
  Patch,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Logger } from 'nestjs-pino';

import { OrderService } from './order.service';
import type { AuthRequest } from 'src/common/types/auth-request.type';
import { UserCreateOrderDto } from './dto/user-create-order.dto';
import { PaginateOrdersDto } from './dto/paginate-orders.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Role } from 'src/user/user.enum';

@Controller('orders')
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly logger: Logger,
  ) { }

  @Post()
  @Throttle({ short: { ttl: 10_000, limit: 5 } })
  async createOrder(
    @Req() req: AuthRequest,
    @Body() dto: UserCreateOrderDto,
    @Headers('x-idempotency-key') xIdem?: string,
    @Headers('idempotency-key') idem?: string,
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

  @Get('id/:id')
  @Roles(Role.Admin)
  async getOrderById(@Param('id') id: string) {
    return this.orderService.getOrderById(id);
  }

  @Patch('id/:id/status')
  @Roles(Role.Admin)
  async updateOrderStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.orderService.updateOrderStatus(id, dto);
  }

  @Get()
  @Roles(Role.Admin)
  paginate(@Query() query: PaginateOrdersDto) {
    return this.orderService.paginate(query);
  }

  @Get('me')
  async getMyOrders(
    @Req() req: AuthRequest,
    @Query('product') productId?: string,
    @Query('active') active?: string,
  ) {
    const userId = req?.user?.userId;
    if (!userId) throw new BadRequestException('AUTH_REQUIRED');
    const onlyActive = active?.toLowerCase() === 'true';
    return this.orderService.getUserOrders(userId, {
      productId,
      onlyActive,
    });
  }
}
