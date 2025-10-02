// src/referrals/schemas/referral.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type ReferralDocument = Referral & Document;

@Schema({ timestamps: true })
export class Referral {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Broker', required: true })
  broker: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  user: MongooseSchema.Types.ObjectId;

  @Prop({ trim: true })
  partnerCode?: string;

  @Prop({ type: String, trim: true })
  registerUrl?: string;
}

export const ReferralSchema = SchemaFactory.createForClass(Referral);

// Make one referral per (broker,user) pair
ReferralSchema.index({ broker: 1, user: 1 }, { unique: true });
