import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type EmailVerificationTokenDocument = HydratedDocument<EmailVerificationToken>;

@Schema({ timestamps: true })
export class EmailVerificationToken {
    @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
    userId: Types.ObjectId;

    // store SHA-256 hex of the raw token (never store raw)
    @Prop({ type: String, required: true, index: true })
    tokenHash: string;

    // TTL index: document expires exactly at expiresAt
    @Prop({ type: Date, required: true, index: { expireAfterSeconds: 0 } })
    expiresAt: Date;

    @Prop({ type: Date, default: null })
    usedAt?: Date | null;

    @Prop() issuedIp?: string;
    @Prop() issuedUa?: string;
}
export const EmailVerificationTokenSchema = SchemaFactory.createForClass(EmailVerificationToken);

// fast validation lookups
EmailVerificationTokenSchema.index({ tokenHash: 1, usedAt: 1, expiresAt: 1 });
