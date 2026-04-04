import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type EaSettingsDocument = HydratedDocument<EaSettings>;

@Schema({ collection: 'ea-settings', timestamps: true })
export class EaSettings {
    @Prop({ required: true, index: true })
    agentId!: string;

    @Prop({ required: true })
    presetName!: string;

    @Prop({ type: Object, required: true })
    settings!: Record<string, unknown>;

    @Prop({ default: false })
    isActive!: boolean;
}

export const EaSettingsSchema = SchemaFactory.createForClass(EaSettings);

EaSettingsSchema.index({ agentId: 1, presetName: 1 }, { unique: true });
