// src/analyze-news/analyze-news.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { Direction, Pair } from 'src/trading-plan/trading-plan.enum';

export type AnalyzeNewsDocument = AnalyzeNews & Document;

@Schema({ timestamps: true })
export class AnalyzeNews {
    @Prop({ type: String, required: true, trim: true, maxlength: 200 })
    title!: string;

    @Prop({ type: String })
    description: string;

    @Prop({ type: String, enum: Object.values(Pair), required: false })
    pair?: Pair;

    @Prop({
        type: String,
        enum: Object.values(Direction),
        default: Direction.Bearish,
    })
    impact!: Direction;

    @Prop({ type: String, default: '', trim: true, maxlength: 500 })
    thumbnailUrl!: string;
}

export const AnalyzeNewsSchema = SchemaFactory.createForClass(AnalyzeNews);
