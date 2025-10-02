// src/plans/plan.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { PlanCategory } from './plan.enum';

export type PlanDocument = Plan & Document;


@Schema({ collection: 'plans', timestamps: true })
export class Plan {
    // title – plan name
    @Prop({ type: String, required: true, trim: true, maxlength: 120 })
    title!: string;

    // description – marketing/detail text
    @Prop({ type: String, default: '', maxlength: 2000 })
    description!: string;

    // price – numeric amount (no currency)
    @Prop({ type: Number, required: true, min: 0 })
    price!: number;

    // billingPeriod – number of months (e.g., 1, 6, 12)
    @Prop({ type: Number, required: true, min: 1 })
    billingPeriod!: number;

    // paymentUrl – checkout URL
    @Prop({ type: String, required: true, trim: true, maxlength: 500 })
    paymentUrl!: string;

    // category – service type (Indicator, Course, VPS, Bot)
    @Prop({ type: String, enum: Object.values(PlanCategory), required: true })
    category!: PlanCategory;

    // features – single string (comma- or newline-separated)
    @Prop({ type: String, default: '', maxlength: 4000 })
    features!: string;

    // marketingTagline – short promo text (e.g., "Save $2", "Most Popular")
    @Prop({ type: String, default: '', trim: true, maxlength: 80 })
    marketingTagline!: string;
}

export const PlanSchema = SchemaFactory.createForClass(Plan);

// Optional indexes
PlanSchema.index({ category: 1, price: 1 });
PlanSchema.index({ title: 'text', description: 'text', features: 'text' });
