// src/retailer/retailer.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RetailLatestDocument = HydratedDocument<RetailLatest>;

@Schema({ timestamps: true })
export class RetailLatest {
  @Prop({ required: true, unique: true, index: true, uppercase: true, trim: true })
  pair!: string;

  @Prop({ type: Number, min: 0, max: 100 })
  avgLeft?: number;

  @Prop({ type: Number, min: 0, max: 100 })
  avgRight?: number;

  @Prop({ type: String, enum: ['buy', 'sell', 'neutral'], default: null })
  signal?: 'buy' | 'sell' | 'neutral' | null;

  @Prop({ type: Date, required: true })
  runAt!: Date;
}

export const RetailLatestSchema = SchemaFactory.createForClass(RetailLatest);

RetailLatestSchema.index({ runAt: -1 });

