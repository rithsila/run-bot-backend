// src/plans/plan.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { PlanCategory } from './plan.enum';

export type PlanDocument = Plan & Document;


@Schema({ collection: 'plans', timestamps: true })
export class Plan {
    @Prop({ type: String, required: true, trim: true, maxlength: 120 })
    title!: string;

    @Prop({ type: String, default: '', maxlength: 2000 })
    description!: string;

    @Prop({ type: Number, required: true, min: 0 })
    price!: number;

    @Prop({ type: Number, required: true, min: 1 })
    billingPeriod!: number;

    @Prop({ type: String, required: true, trim: true, maxlength: 500 })
    paymentUrl!: string;

    @Prop({ type: String, enum: Object.values(PlanCategory), required: true })
    category!: PlanCategory;

    @Prop({ type: String, default: '', maxlength: 4000 })
    features!: string;

    @Prop({ type: String, default: '', trim: true, maxlength: 80 })
    marketingTagline!: string;
}

export const PlanSchema = SchemaFactory.createForClass(Plan);

PlanSchema.index({ category: 1, price: 1 });
PlanSchema.index({ title: 'text', description: 'text', features: 'text' });
