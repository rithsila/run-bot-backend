// src/referrals/referral.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, PaginateModel, Types } from 'mongoose';
import paginate from 'mongoose-paginate-v2';
import { User } from 'src/user/user.schema';

export type ReferralDocument = Referral & Document;
export type ReferralPaginateModel = PaginateModel<ReferralDocument>;

@Schema({ collection: 'referrals', timestamps: true, versionKey: false })
export class Referral {
    // The user who owns this referral (will be populated with User)
    @Prop({
        type: Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    })
    owner!: Types.ObjectId | User;

    // Referral link (URL string)
    @Prop({
        type: String,
        trim: true,
        required: true,
        unique: true,
        // simple URL pattern; adjust as you like
        match: /^https?:\/\/[^\s/$.?#].[^\s]*$/i,
    })
    link!: string;

    // Referral code (similar style to coupon code)
    @Prop({
        type: String,
        trim: true,
        uppercase: true,
        index: true,
        unique: true,
        required: true,
        match: /^[A-Z0-9-]{5,32}$/,
    })
    code!: string;
}

export const ReferralSchema = SchemaFactory.createForClass(Referral);
ReferralSchema.plugin(paginate);

