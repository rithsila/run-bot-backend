// src/coupons/coupon.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { CouponStatus } from './plan.enum';

export type CouponDocument = Coupon & Document;

@Schema({ timestamps: true, collection: 'coupons' })
export class Coupon {
    @Prop({ type: String, required: true, trim: true, maxlength: 120 })
    owner!: string;

    @Prop({
        type: String,
        required: true,
        trim: true,
        minlength: 4,
        maxlength: 32,
        uppercase: true,
        unique: true,
        index: true,
        set: (v: string) => v?.trim().toUpperCase(),
    })
    code!: string;

    @Prop({ type: Number, required: true, min: 0 })
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

CouponSchema.index({ owner: 1, status: 1 });
