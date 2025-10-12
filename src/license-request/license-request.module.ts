import { Module } from '@nestjs/common';
import { LicenseRequestService } from './license-request.service';
import { LicenseRequestController } from './license-request.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { LicenseRequest, LicenseRequestSchema } from './license-request.schema';
import { WebPushSubModule } from 'src/web-push-sub/web-push-sub.module';
import { ReferralModule } from 'src/referrals/referrals.module';
import { Membership, MembershipSchema } from 'src/referrals/memberships.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LicenseRequest.name, schema: LicenseRequestSchema },
      { name: Membership.name, schema: MembershipSchema }
    ]),
    WebPushSubModule,
    ReferralModule
  ],
  providers: [LicenseRequestService],
  controllers: [LicenseRequestController]
})
export class LicenseRequestModule { }
