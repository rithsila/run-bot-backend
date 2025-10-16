import { Module } from '@nestjs/common';
import { PlanService } from './plan.service';
import { PlanController } from './plan.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Plan, PlanSchema } from './plan.schema';
import { CouponService } from './coupon.service';
import { Coupon, CouponSchema } from './coupon.schema';
import { CouponController } from './coupon.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Plan.name, schema: PlanSchema },
      { name: Coupon.name, schema: CouponSchema }
    ]),
  ],
  providers: [PlanService, CouponService],
  controllers: [PlanController, CouponController]
})
export class PlanModule { }
