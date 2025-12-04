// src/subscriptions/subscriptions.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { BillPeriod } from 'src/products/product.schema';

export type SubscriptionDocument = HydratedDocument<Subscription>;

export enum SubscriptionStatus {
  Pending = 'Pending',
  Active = 'Active',
  Paused = 'Paused',
  Cancelled = 'Cancelled',
}

@Schema({ collection: 'subscriptions', timestamps: true })
export class Subscription {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product', required: true, index: true })
  product!: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(SubscriptionStatus),
    default: SubscriptionStatus.Active,
    index: true,
  })
  status!: SubscriptionStatus;

  @Prop({ type: Date, required: true })
  nextBill!: Date;

  @Prop({ type: String, maxlength: 5000 })
  notes?: string;

  @Prop({ type: String, enum: Object.values(BillPeriod), required: true })
  billPeriod!: BillPeriod;
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);

SubscriptionSchema.index({ user: 1, product: 1 }, { unique: true });
