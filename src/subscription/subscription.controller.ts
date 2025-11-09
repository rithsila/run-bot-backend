// src/subscriptions/subscriptions.controller.ts
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
  UsePipes,
  ValidationPipe,
  Param,
  Patch,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthRequest } from 'src/common/types/auth-request.type';
import type { ApiSuccess } from 'src/common/types/api-response.type';
import { JwtAuthGuard } from 'src/auth/guard/jwt-auth.guard';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import type { Subscription } from './subscription.schema';
import { SubscriptionService } from './subscription.service';
import { Types } from 'mongoose';
import { SubscriptionsPaginateDto } from './dto/subscriptions-paginate.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { Role } from 'src/user/user.enum';
import { Roles } from 'src/auth/decorators/roles.decorator';

@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionService) { }

  @Get()
  @Roles(Role.Admin)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  list(@Query() query: SubscriptionsPaginateDto) {
    return this.subscriptions.paginate(query);
  }

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  )
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Req() req: AuthRequest,
    @Body() dto: CreateSubscriptionDto,
  ): Promise<ApiSuccess<Subscription>> {
    // JwtAuthGuard ensures req.user exists
    const userId = req.user?.userId;
    // Service will throw if anything is invalid (plan/coupon/overlap)
    const created = await this.subscriptions.createPayment(new Types.ObjectId(userId), dto);

    // Ensure we return a plain object (not a live Mongoose document)
    const data: Subscription = JSON.parse(JSON.stringify(created));

    return {
      success: true,
      statusCode: HttpStatus.CREATED,
      code: 'SUBSCRIPTION_CREATED',
      message: 'Subscription created successfully.',
      data,
      timestamp: new Date().toISOString(),
      path: req.url,
    };
  }

  @Get("me")
  @HttpCode(HttpStatus.OK)
  async getMine(@Req() req: AuthRequest) {
    const uid = req?.user?.userId;
    if (!uid) throw new UnauthorizedException('AUTH_REQUIRED');


    const sub = await this.subscriptions.getMySubscription(uid);
    return {
      success: true,
      statusCode: 200,
      code: "MY_SUBSCRIPTION_OK",
      message: "Fetched subscription.",
      timestamp: new Date().toISOString(),
      path: "/subscriptions/me",
      data: sub,
    };
  }

  @Patch(':id')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.OK)
  async updatePartial(
    @Param('id') id: string,
    @Body() dto: UpdateSubscriptionDto,
  ) {


    const updated = await this.subscriptions.updatePartial(id, dto);

    return {
      success: true,
      statusCode: HttpStatus.OK,
      code: 'SUBSCRIPTION_UPDATED',
      message: 'Subscription updated successfully.',
      timestamp: new Date().toISOString(),
      path: `/subscriptions/${id}`,
      data: updated,
    };
  }
}
