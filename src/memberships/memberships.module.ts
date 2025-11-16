import { Module } from '@nestjs/common';
import { MembershipsService } from './memberships.service';
import { MembershipsController } from './memberships.controller';
import { WebPushSubModule } from 'src/web-push-sub/web-push-sub.module';
import { MongooseModule } from '@nestjs/mongoose';
import { Membership, MembershipSchema } from './memberships.schema';
import { User, UserSchema } from 'src/user/user.schema';
import { QueueModule } from 'src/queue/queue.module';
import { Subscription, SubscriptionSchema } from 'src/subscription/subscription.schema';
import { JoseService } from './jose.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Membership.name, schema: MembershipSchema },
      { name: User.name, schema: UserSchema },
      { name: Subscription.name, schema: SubscriptionSchema }
    ]),
    WebPushSubModule,
    QueueModule
  ],
  providers: [MembershipsService, JoseService],
  controllers: [MembershipsController]
})
export class MembershipsModule { }
