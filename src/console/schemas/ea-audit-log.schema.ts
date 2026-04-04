import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type EaAuditLogDocument = HydratedDocument<EaAuditLog>;

export enum AuditEvent {
    KillSwitch = 'kill_switch',
    MasterEnable = 'master_enable',
    SettingsChange = 'settings_change',
    BridgeConnect = 'bridge_connect',
    BridgeDisconnect = 'bridge_disconnect',
    AlertSent = 'alert_sent',
}

@Schema({ collection: 'ea-audit-logs', timestamps: true })
export class EaAuditLog {
    @Prop({ required: true, index: true })
    agentId!: string;

    @Prop({ required: true, enum: Object.values(AuditEvent) })
    event!: AuditEvent;

    @Prop({ type: Object, default: {} })
    payload!: Record<string, unknown>;

    @Prop({ type: String, default: null })
    userId!: string | null;
}

export const EaAuditLogSchema = SchemaFactory.createForClass(EaAuditLog);
