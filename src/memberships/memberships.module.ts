import { Module } from '@nestjs/common';
import { MembershipsService } from './memberships.service';
import { MembershipsController } from './memberships.controller';
import { WebPushSubModule } from 'src/web-push-sub/web-push-sub.module';
import { MongooseModule } from '@nestjs/mongoose';
import { Membership, MembershipSchema } from './memberships.schema';
import { User, UserSchema } from 'src/user/user.schema';
import { JoseService } from './jose.service';
import { ReferralsModule } from './referrals.module';
import { Referral, ReferralSchema } from './referral.schema';
import { MembershipIpBlacklist, MembershipIpBlacklistSchema } from './membership-ip-blacklist.schema';
import { Subscription, SubscriptionSchema } from 'src/subscriptions/subscriptions.schema';
import { KolsMembershipService } from './kols-membership.service';
import { KolsMembershipsController } from './kols-memberships.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Membership.name, schema: MembershipSchema },
      { name: User.name, schema: UserSchema },
      { name: Referral.name, schema: ReferralSchema },
      { name: MembershipIpBlacklist.name, schema: MembershipIpBlacklistSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
    ]),
    WebPushSubModule,
    ReferralsModule
  ],
  providers: [MembershipsService, JoseService, KolsMembershipService],
  controllers: [MembershipsController, KolsMembershipsController]
})
export class MembershipsModule { }
