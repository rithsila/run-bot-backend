import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type EaPnlPointDocument = HydratedDocument<EaPnlPoint>;

/**
 * Periodic PnL snapshot for an EA instance (RB-60).
 *
 * The scheduler samples each online instance's cached telemetry on a fixed
 * interval and persists one point here. The web dashboard reads the history
 * back to render an equity/PnL chart that survives page refresh.
 *
 * `ts` is the broker-server timestamp (ms) from the telemetry frame, so points
 * align with the live feed rather than wall-clock insertion time.
 */
@Schema({ collection: 'ea-pnl-points', timestamps: true })
export class EaPnlPoint {
    @Prop({ required: true, index: true })
    agentId!: string;

    @Prop({ required: true })
    ts!: number; // unix ms (broker server time)

    @Prop({ required: true })
    equity!: number;

    @Prop({ required: true })
    balance!: number;

    @Prop({ required: true })
    totalPnl!: number; // open positions PnL, account currency

    @Prop({ required: true })
    dailyPnl!: number; // realized daily PnL, account currency
}

export const EaPnlPointSchema = SchemaFactory.createForClass(EaPnlPoint);

// Fast range reads per instance ordered by time.
EaPnlPointSchema.index({ agentId: 1, ts: 1 });
