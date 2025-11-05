// src/subscriptions/subscription.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, PaginateModel, Types } from 'mongoose';
import paginate from 'mongoose-paginate-v2';

export type SubscriptionStatus =
  | 'init'
  | 'active'
  | 'past_due'
  | 'paused'
  | 'cancelled';

export type SubscriptionDocument = Subscription & Document;
export type SubscriptionPaginateModel = PaginateModel<SubscriptionDocument>;

@Schema({ collection: 'subscriptions', timestamps: true, versionKey: false })
export class Subscription {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Plan', required: true, index: true })
  plan!: Types.ObjectId;

  @Prop({
    type: String,
    // enum: ['init', 'active', 'past_due', 'paused', 'cancelled'],
    // default: 'init',
  })
  status!: string;

  @Prop({ type: Date, required: true, default: () => new Date() })
  startAt!: Date;

  @Prop({ type: Number, enum: [1, 3, 6, 12], required: true })
  billingPeriod!: number;

  @Prop({ type: Number, required: true, min: 0 })
  amount!: number;

  @Prop({ type: Types.ObjectId, ref: 'Coupon', default: null })
  coupon?: Types.ObjectId | null;

  @Prop({ type: Number, default: 0, min: 0 })
  discount?: number;

  @Prop({ type: String, trim: true, maxlength: 120, required: true })
  bankAccountName!: string;

  @Prop({ type: String, trim: true, maxlength: 120 })
  tradingViewUsername?: string;

  @Prop({
    type: String,
    trim: true,
    maxlength: 60,
    match: [/^[A-Za-z0-9._-]{1,60}$/, 'Invalid Sn1p3r Concept account'],
    index: true,
  })
  sn1p3rConceptAccount?: string;

  @Prop({
    type: String,
    trim: true,
    maxlength: 60,
    match: [/^[A-Za-z0-9._-]{1,60}$/, 'Invalid Risk Manager account'],
    index: true,
  })
  riskManagerAccount?: string;

  @Prop({
    type: String,
    trim: true,
    maxlength: 60,
    match: [/^[A-Za-z0-9._-]{1,60}$/, 'Invalid Sn1p3r Shot account'],
    index: true,
  })
  sn1p3rShotAccount?: string;

  @Prop({
    type: String,
  })
  noted?: string;

  // 🔑 NEW FIELDS: license keys
  @Prop({
    type: String,
    trim: true,
    maxlength: 120,
    index: true,
  })
  sn1p3rConceptKey?: string;

  @Prop({
    type: String,
    trim: true,
    maxlength: 120,
    index: true,
  })
  riskManagerKey?: string;

  @Prop({
    type: String,
    trim: true,
    maxlength: 120,
    index: true,
  })
  sn1p3rShotKey?: string;

  @Prop({ type: Date, required: true, index: true })
  nextInvoiceAt!: Date;

}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);

SubscriptionSchema.plugin(paginate);

