// src/memberships/membership-ip-blacklist.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MembershipIpBlacklistDocument = MembershipIpBlacklist & Document;

@Schema({ collection: 'membership_ip_blacklist', timestamps: true })
export class MembershipIpBlacklist {
    @Prop({
        type: String,
        required: true,
        trim: true,
        match: [
            /^(?:\d{1,3}\.){3}\d{1,3}$|^[0-9a-fA-F:]+$/,
            'Invalid IP address',
        ],
    })
    ip!: string;

    @Prop({ type: String, trim: true, maxlength: 500 })
    reason?: string;
}

export const MembershipIpBlacklistSchema = SchemaFactory.createForClass(
    MembershipIpBlacklist,
);
MembershipIpBlacklistSchema.index({ ip: 1 }, { unique: true });
