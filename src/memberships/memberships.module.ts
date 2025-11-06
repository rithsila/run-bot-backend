import { Module } from '@nestjs/common';
import { MembershipsService } from './memberships.service';
import { MembershipsController } from './memberships.controller';
import { WebPushSubModule } from 'src/web-push-sub/web-push-sub.module';
import { MongooseModule } from '@nestjs/mongoose';
import { Membership, MembershipSchema } from './memberships.schema';
import { User, UserSchema } from 'src/user/user.schema';
import { QueueModule } from 'src/queue/queue.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Membership.name, schema: MembershipSchema },
      { name: User.name, schema: UserSchema }
    ]),
    WebPushSubModule,
    QueueModule
  ],
  providers: [MembershipsService],
  controllers: [MembershipsController]
})
export class MembershipsModule { }
