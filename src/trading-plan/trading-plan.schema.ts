// src/trading-plans/trading-plan.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Direction, Pair } from './trading-plan.enum';

export type TradingPlanDocument = TradingPlan & Document;

@Schema({ collection: 'trading_plans', timestamps: true })
export class TradingPlan {
    @Prop({ type: String, enum: Object.values(Pair), required: true })
    pair!: Pair;

    @Prop({ type: String, enum: Object.values(Direction), required: true })
    direction!: Direction;

    @Prop({ type: String, default: '', trim: true, maxlength: 2000 })
    description!: string;

    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    publishedBy!: Types.ObjectId;

    @Prop({ type: String, default: '', trim: true, maxlength: 500 })
    thumbnailUrl!: string;

    @Prop({
        type: String,
        required: false,         
        trim: true,
    })
    tradingViewId?: string;

}

export const TradingPlanSchema = SchemaFactory.createForClass(TradingPlan);
