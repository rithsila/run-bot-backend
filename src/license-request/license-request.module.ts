import { Module } from '@nestjs/common';
import { LicenseRequestService } from './license-request.service';
import { LicenseRequestController } from './license-request.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { LicenseRequest, LicenseRequestSchema } from './license-request.schema';
import { WebPushSubModule } from 'src/web-push-sub/web-push-sub.module';
import { ReferralModule } from 'src/referrals/referrals.module';
import { Membership, MembershipSchema } from 'src/referrals/memberships.schema';
import { Subscription, SubscriptionSchema } from 'src/subscription/subscription.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LicenseRequest.name, schema: LicenseRequestSchema },
      { name: Membership.name, schema: MembershipSchema },
      { name: Subscription.name, schema: SubscriptionSchema }

    ]),
    WebPushSubModule,
    ReferralModule
  ],
  providers: [LicenseRequestService],
  controllers: [LicenseRequestController]
})
export class LicenseRequestModule { }
