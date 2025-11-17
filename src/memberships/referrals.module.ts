// src/referrals/referrals.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ReferralsService } from './referrals.service';
import { ReferralsController } from './referrals.controller';
import { Referral, ReferralSchema } from './referral.schema';
import { User, UserSchema } from 'src/user/user.schema';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Referral.name, schema: ReferralSchema },
            { name: User.name, schema: UserSchema },
        ]),
    ],
    providers: [ReferralsService],
    controllers: [ReferralsController],
    exports: [ReferralsService], // 👈 so other modules (like MembershipsModule) can inject it
})
export class ReferralsModule { }
