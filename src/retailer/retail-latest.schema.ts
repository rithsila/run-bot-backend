import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'retail_latest', timestamps: true })
export class RetailLatest extends Document {
  @Prop({ required: true, unique: true, index: true, uppercase: true, trim: true })
  pair!: string;

  @Prop({ type: Number, min: 0, max: 100 }) avgLeft?: number;
  @Prop({ type: Number, min: 0, max: 100 }) avgRight?: number;

  @Prop({ type: String, enum: ['buy', 'sell', 'neutral', null], default: null })
  signal?: string | null;

  @Prop({ type: Date, required: true })
  runAt!: Date; // last updated timestamp from webhook
}

export const RetailLatestSchema = SchemaFactory.createForClass(RetailLatest);
RetailLatestSchema.index({ runAt: -1 });
