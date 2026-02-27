import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IndicatorService } from './indicator.service';
import { IndicatorController } from './indicator.controller';
import { Indicator, IndicatorSchema } from './indicator.schema';
import { Membership, MembershipSchema } from 'src/memberships/memberships.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Indicator.name, schema: IndicatorSchema },
      { name: Membership.name, schema: MembershipSchema },
    ]),
  ],
  providers: [IndicatorService],
  controllers: [IndicatorController],
})
export class IndicatorModule {}
