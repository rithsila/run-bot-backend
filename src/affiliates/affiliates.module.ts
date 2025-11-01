import { Module } from '@nestjs/common';
import { AffiliatesService } from './affiliates.service';
import { AffiliatesController } from './affiliates.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from 'src/user/user.schema';
import { WebPushSubModule } from 'src/web-push-sub/web-push-sub.module';
import { ReferralModule } from 'src/referrals/referrals.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    WebPushSubModule,
    ReferralModule
  ],
  providers: [AffiliatesService],
  controllers: [AffiliatesController]
})
export class AffiliatesModule { }
