// src/coupons/coupon.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { CouponStatus } from './plan.enum';

export type CouponDocument = HydratedDocument<Coupon>; // ✅ instead of Coupon & Document

@Schema({ timestamps: true, collection: 'coupons' })
export class Coupon {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  owner!: MongooseSchema.Types.ObjectId;

  @Prop({ type: String, required: true, minlength: 4, maxlength: 6, unique: true })
  code!: string;

  @Prop({ type: Number, required: true, min: 0, default: 20 })
  discount!: number;

  @Prop({
    type: String,
    enum: Object.values(CouponStatus),
    default: CouponStatus.Active,
    index: true,
  })
  status!: CouponStatus;
}

export const CouponSchema = SchemaFactory.createForClass(Coupon);
