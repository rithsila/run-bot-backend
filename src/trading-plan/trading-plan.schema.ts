// src/trading-plans/trading-plan.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Direction, Pair } from './trading-plan.enum';
import { User } from 'src/user/user.schema';

export type TradingPlanDocument = TradingPlan & Document & { _id: Types.ObjectId };

@Schema({ collection: 'trading_plans', timestamps: true })
export class TradingPlan {


    @Prop({ type: String, enum: Object.values(Pair), required: true })
    pair!: Pair;

    @Prop({ type: String, enum: Object.values(Direction), required: true })
    direction!: Direction;

    @Prop({ type: String, default: '', trim: true, maxlength: 2000 })
    description!: string;

    @Prop({
        type: String,
        required: true,
        trim: true,
        maxlength: 120,
        match: /^[A-Za-z0-9_-]+$/,
    })
    tradingViewId!: string;

    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    publishedBy!: Types.ObjectId;
}

export const TradingPlanSchema = SchemaFactory.createForClass(TradingPlan);
