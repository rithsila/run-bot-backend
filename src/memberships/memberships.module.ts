import { Module } from '@nestjs/common';
import { MembershipsService } from './memberships.service';
import { MembershipsController } from './memberships.controller';
import { WebPushSubModule } from 'src/web-push-sub/web-push-sub.module';
import { MongooseModule } from '@nestjs/mongoose';
import { Membership, MembershipSchema } from './memberships.schema';
import { User, UserSchema } from 'src/user/user.schema';
import { QueueModule } from 'src/queue/queue.module';
import { JoseService } from './jose.service';
import { ReferralsModule } from './referrals.module';
import { Referral, ReferralSchema } from './referral.schema';
import { MembershipIpBlacklist, MembershipIpBlacklistSchema } from './membership-ip-blacklist.schema';
import { Subscription, SubscriptionSchema } from 'src/subscriptions/subscriptions.schema';

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
    QueueModule,
    ReferralsModule
  ],
  providers: [MembershipsService, JoseService],
  controllers: [MembershipsController]
})
export class MembershipsModule { }
