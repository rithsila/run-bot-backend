import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type WebPushSubDocument = HydratedDocument<WebPushSub>;

@Schema({ collection: 'web_push_subs', timestamps: true })
export class WebPushSub {
    @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
    userId!: Types.ObjectId;

    @Prop({ required: true }) endpoint!: string;
    @Prop({ required: true }) p256dh!: string;
    @Prop({ required: true }) auth!: string;

    @Prop({ type: Date, default: null }) expirationTime!: Date | null;
    @Prop({ type: String, default: null }) deviceId!: string | null;
    @Prop({ type: String, default: null }) userAgent!: string | null;
    @Prop({ type: String, default: null }) ipHint!: string | null;

    @Prop({ type: Boolean, default: true, index: true })
    active!: boolean;

    @Prop({ type: Date, default: () => new Date() })
    lastFailedAt!: Date | null;
}

export const WebPushSubSchema = SchemaFactory.createForClass(WebPushSub);

WebPushSubSchema.index({ userId: 1, endpoint: 1 }, { unique: true });
