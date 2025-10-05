// src/schemas/ea-snqp.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { MembershipStatus } from 'src/referrals/memberships.enum';

export type EaSnqpDocument = EaSnqp & Document;

@Schema({ timestamps: true, collection: 'ea_snqp' })
export class EaSnqp {
    @Prop({ type: String, trim: true, maxlength: 200 })
    tradingAccount?: string;

    @Prop({
        type: [{ type: String, trim: true, maxlength: 50 }],
        default: [],
        validate: {
            validator: (arr: string[]) =>
                Array.isArray(arr) &&
                arr.every((s) => typeof s === 'string' && /^[A-Za-z0-9._-]{3,50}$/.test(s.trim())),
            message: 'Each account number must be 3–50 chars, alphanumeric plus . _ - only.',
        },
    })
    accountNumbers!: string[];

    @Prop({ type: String, enum: MembershipStatus, default: MembershipStatus.Request, index: true })
    status!: MembershipStatus;

    @Prop({ type: String, trim: true, maxlength: 5000 })
    bankAccount?: string;

    @Prop({ type: String, trim: true, maxlength: 5000 })
    tradingView?: string;

    @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
    user!: Types.ObjectId;

    @Prop({ type: Date, default: Date.now })
    issueDate!: Date;

    @Prop({ type: Date, default: Date.now })
    expiryDate: Date;

    @Prop({
        type: String,
        unique: true,
        select: false,
        trim: true,
        maxlength: 255,
        default: "",
    })
    licenseKey!: string;
}

export const EaSnqpSchema = SchemaFactory.createForClass(EaSnqp);
