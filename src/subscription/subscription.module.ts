import { Module } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Plan, PlanSchema } from 'src/plan/plan.schema';
import { Subscription, SubscriptionSchema } from './subscription.schema';
import { SubscriptionsController } from './subscription.controller';
import { Coupon, CouponSchema } from 'src/coupons/coupon.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: Plan.name, schema: PlanSchema },
      { name: Coupon.name, schema: CouponSchema }
    ]),
  ],
  providers: [SubscriptionService],
  controllers: [SubscriptionsController]
})
export class SubscriptionModule { }
