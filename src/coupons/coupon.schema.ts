// src/coupons/coupon.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, PaginateModel, Types } from 'mongoose';
import paginate from 'mongoose-paginate-v2';

export type CouponDocument = Coupon & Document;
export type CouponPaginateModel = PaginateModel<CouponDocument>;

export enum CouponStatus {
    Request = 'Request',
    Active = 'Active',
    Inactive = 'Inactive',
    Scheduled = 'Scheduled',
    Expired = 'Expired',
}

@Schema({ collection: 'coupons', timestamps: true, versionKey: false })
export class Coupon {
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

    // Default 20% (allows decimals, 0.01–100)
    @Prop({
        type: Number,
        required: true,
        min: 0.01,
        max: 100,
        default: 10,
    })
    percent!: number;

    @Prop({
        type: String,
        enum: Object.values(CouponStatus),
        default: CouponStatus.Request,
        index: true,
    })
    status!: CouponStatus;

    @Prop({ type: Types.ObjectId, ref: 'User', index: true, required: true })
    createdBy!: Types.ObjectId;

    @Prop({ type: String, trim: true })
    notes?: string;
}

export const CouponSchema = SchemaFactory.createForClass(Coupon);
CouponSchema.plugin(paginate);

CouponSchema.pre('validate', function (next) {
    const doc = this as CouponDocument;
    if (doc.percent == null) return next(new Error('percent is required'));
    next();
});
