// src/retailer/retailer.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RetailerDocument = HydratedDocument<Retailer>;

export type Signal = 'buy' | 'sell' | 'neutral';

@Schema({ collection: 'retailers' }) // collection name
export class Retailer {
    @Prop({ type: String, required: true, trim: true, uppercase: true })
    pair!: string;

    @Prop({ type: Number, min: 0, max: 100, required: true })
    avgLeft!: number;

    @Prop({ type: Number, min: 0, max: 100, required: true })
    avgRight!: number;

    @Prop({
        type: String,
        enum: ['buy', 'sell', 'neutral'],
        required: true,
    })
    signal!: Signal;

    @Prop({ type: Date, required: true, index: true })
    runAt!: Date;
}

export const RetailerSchema = SchemaFactory.createForClass(Retailer);

// Prevent duplicates for the same pair at the same timestamp
RetailerSchema.index({ pair: 1, runAt: 1 }, { unique: true });

// Optional: if you often query the latest per pair
RetailerSchema.index({ pair: 1, runAt: -1 });
