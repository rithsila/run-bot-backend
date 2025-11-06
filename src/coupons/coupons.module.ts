import { Module } from '@nestjs/common';
import { CouponsService } from './coupons.service';
import { CouponsController } from './coupons.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { WebPushSubModule } from 'src/web-push-sub/web-push-sub.module';
import { Coupon, CouponSchema } from './coupon.schema';
import { Membership, MembershipSchema } from 'src/memberships/memberships.schema';
import { QueueModule } from 'src/queue/queue.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Coupon.name, schema: CouponSchema },
      { name: Membership.name, schema: MembershipSchema },
    ]),
    WebPushSubModule,
    QueueModule
  ],
  providers: [CouponsService],
  controllers: [CouponsController]
})
export class CouponsModule { }
