import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ProductDocument = HydratedDocument<Product>;

export enum BillPeriod {
  MONTH = 'MONTH',
  THREE_MONTHS = 'THREE_MONTHS',
  SIX_MONTHS = 'SIX_MONTHS',
  YEAR = 'YEAR',
  LIFETIME = 'LIFETIME',
  ONE_TIME = 'ONE_TIME',
}

@Schema({ collection: 'products', timestamps: true })
export class Product {
  @Prop({ type: String, required: true, trim: true, maxlength: 120 })
  name!: string;

  @Prop({ type: String, trim: true, maxlength: 2000 })
  description?: string;

  @Prop({ type: String, trim: true, maxlength: 4000 })
  features?: string;

  @Prop({ type: Boolean, default: false })
  requireTradingViewUsername!: boolean;

  @Prop({ type: String, trim: true, maxlength: 4000 })
  policy?: string;

  @Prop({ type: Boolean, default: false })
  requiresLicenseKey!: boolean;

  @Prop({
    type: [
      {
        billPeriod: {
          type: String,
          enum: Object.values(BillPeriod),
          required: true,
        },
        pricing: {
          type: Number,
          required: true,
          min: 0,
        },
        url: {
          type: String,
          required: true,
          trim: true,
          maxlength: 500,
        },
      },
    ],
    default: [],
  })
  payWayUrls?: { billPeriod: BillPeriod; pricing: number; url: string }[];
}

export const ProductSchema = SchemaFactory.createForClass(Product);
