// src/marketplace/product.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Category } from './category.schema';

export type ProductDocument = HydratedDocument<Product>;

export enum ProductStatus {
  Active = 'active',
  Subspend = 'subspend',
  Inactive = 'inactive',
}

@Schema({
  collection: 'products',
  timestamps: true,
})
export class Product {
  @Prop({ type: String, required: true, trim: true })
  name!: string;

  // description: string with a maximum limit
  @Prop({ type: String, trim: true, maxlength: 2000 })
  description?: string;

  // features: plain string (not an array)
  @Prop({ type: String, trim: true })
  features?: string;

  // NEW: free-form note for internal/admin use
  @Prop({ type: String, trim: true, maxlength: 2000 })
  note?: string;

  // category: ref -> Category
  @Prop({
    type: Types.ObjectId,
    ref: Category.name,
    required: true,
    index: true,
  })
  category!: Types.ObjectId;

  // pricing: number
  @Prop({ type: Number, required: true, min: 0 })
  pricing!: number;

  @Prop({ type: Number, required: true, min: 1 })
  billingPeriod!: number;

  // payURL: url
  @Prop({
    type: String,
    trim: true,
    validate: {
      validator: (v: string) => /^https?:\/\/.+/i.test(v),
      message: 'payURL must be a valid URL',
    },
  })
  payURL?: string;

  // discountPayURL: url
  @Prop({
    type: String,
    trim: true,
    validate: {
      validator: (v: string) => !v || /^https?:\/\/.+/i.test(v),
      message: 'discountPayURL must be a valid URL',
    },
  })
  discountPayURL?: string;

  // allowCoupon: boolean (default false)
  @Prop({ type: Boolean, default: false })
  allowCoupon!: boolean;

  // discount: number percentage (0..100)
  @Prop({ type: Number, min: 0, max: 100, default: 0 })
  discount!: number;

  // status: enum
  @Prop({
    type: String,
    enum: Object.values(ProductStatus),
    default: ProductStatus.Active,
    index: true,
  })
  status!: ProductStatus;

  /** ---------- Customer checklist confirmations ---------- */
  @Prop({ type: Boolean, default: false })
  tvUsernameAck!: boolean;

  @Prop({ type: Boolean, default: false })
  accountSnapshotAck!: boolean;

  @Prop({ type: Boolean, default: false })
  accountConceptAck!: boolean;

  @Prop({ type: Boolean, default: false })
  riskManagementAck!: boolean;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

// Helpful index
ProductSchema.index({ name: 1, category: 1 });
