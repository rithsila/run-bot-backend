import { Module } from '@nestjs/common';
import { ReferralsService } from './referrals.service';
import { ReferralsController } from './referrals.controller';
import { BrokersService } from './brokers.service';
import { BrokersController } from './brokers.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Broker, BrokerSchema } from './broker.schema';
import { Referral, ReferralSchema } from './referrals.schema';
import { Membership, MembershipSchema } from './memberships.schema';
import { MembershipsController } from './memberships.controller';
import { MembershipsService } from './memberships.service';
import { UserModule } from 'src/user/user.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Broker.name, schema: BrokerSchema },
      { name: Referral.name, schema: ReferralSchema },
      { name: Membership.name, schema: MembershipSchema }
    ]),
    UserModule
  ],
  providers: [ReferralsService, BrokersService, MembershipsService],
  controllers: [ReferralsController, BrokersController, MembershipsController],
  exports: [MembershipsService]
})
export class ReferralModule { }
