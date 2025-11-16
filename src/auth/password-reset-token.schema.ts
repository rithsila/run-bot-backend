import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PasswordResetTokenDocument = HydratedDocument<PasswordResetToken>;

export type PasswordResetReason = 'forgot' | 'admin' | 'support';

@Schema({ timestamps: true })
export class PasswordResetToken {
    // Link to the account this token resets
    @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
    userId: Types.ObjectId;

    // Store ONLY the SHA-256 hex of the raw token sent in the email
    @Prop({ type: String, required: true, index: true })
    tokenHash: string;

    // TTL: MongoDB will auto-delete the doc once this time passes
    // NOTE: index below uses { expireAfterSeconds: 0 }
    @Prop({ type: Date, required: true, index: true })
    expiresAt: Date;

    // Single-use flag
    @Prop({ type: Date, default: null })
    usedAt?: Date | null;

    // Optional telemetry / auditing
    @Prop({ type: String, default: null })
    issuedIp?: string | null;

    @Prop({ type: String, default: null })
    issuedUa?: string | null;

    // Optional: why this token was issued (useful if admins can trigger resets)
    @Prop({ type: String, default: 'forgot' })
    reason?: PasswordResetReason;
}

export const PasswordResetTokenSchema = SchemaFactory.createForClass(PasswordResetToken);

// ---------- Indexes ----------
// TTL cleanup: expire exactly at expiresAt
PasswordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Fast lookup when consuming token
PasswordResetTokenSchema.index({ tokenHash: 1, usedAt: 1, expiresAt: 1 });

// Manage/kill active tokens for a user (e.g., when issuing a new one)
PasswordResetTokenSchema.index({ userId: 1, usedAt: 1, expiresAt: 1 });
