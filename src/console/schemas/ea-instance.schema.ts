import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type EaInstanceDocument = HydratedDocument<EaInstance>;

@Schema({ collection: 'ea-instances', timestamps: true })
export class EaInstance {
    @Prop({ required: true, unique: true, index: true })
    agentId!: string;

    @Prop({ required: true })
    licenseKey!: string;

    @Prop({ required: true })
    accountLogin!: string;

    @Prop({ required: true })
    symbol!: string;

    @Prop({ default: false, index: true })
    online!: boolean;

    @Prop({ type: Date, default: null })
    lastSeenAt!: Date | null;

    @Prop({ type: Object, default: null })
    lastTelemetry!: Record<string, unknown> | null;

    @Prop({ type: Object, default: null })
    currentSettings!: Record<string, unknown> | null;
}

export const EaInstanceSchema = SchemaFactory.createForClass(EaInstance);
