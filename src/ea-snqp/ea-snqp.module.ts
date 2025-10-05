import { Module } from '@nestjs/common';
import { EaSnqpService } from './ea-snqp.service';
import { EaSnqpController } from './ea-snqp.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { EaSnqp, EaSnqpSchema } from './ea-snqp.schema';
import { ReferralModule } from 'src/referrals/referrals.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: EaSnqp.name, schema: EaSnqpSchema },
    ]),
    ReferralModule
  ],
  providers: [EaSnqpService],
  controllers: [EaSnqpController]
})
export class EaSnqpModule { }
