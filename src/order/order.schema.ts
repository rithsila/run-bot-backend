import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OrderDocument = HydratedDocument<Order>;

export enum OrderStatus {
  INIT = 'INIT',
  UNPAID = 'UNPAID',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

@Schema({
  collection: 'orders',
  timestamps: true, // adds createdAt / updatedAt
})
export class Order {
  /** Buyer */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user!: Types.ObjectId;

  /** Product purchased */
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true, index: true })
  product!: Types.ObjectId;

  /** Current status of the order */
  @Prop({
    type: String,
    enum: Object.values(OrderStatus),
    default: OrderStatus.INIT,
    index: true,
  })
  status!: OrderStatus;

  /**
   * Idempotency key for safely retrying order creations
   * Use a compound unique index with user to keep keys unique per user
   */
  @Prop({ type: String, required: true, trim: true })
  idempotencyKey!: string;

  /** Public/merchant-facing order id string (unique) */
  @Prop({ type: String, required: true, unique: true, trim: true })
  orderId!: string;

  /** Billing period (e.g., months) — must be >= 1 */
  @Prop({ type: Number, required: true, min: 1 })
  billingPeriod!: number;

  /** Gross/charged amount for this order */
  @Prop({ type: Number, required: true, min: 0 })
  amount!: number;

  /** Optional coupon code used at checkout */
  @Prop({ type: String, trim: true, index: true })
  couponCode?: string;

  /** Discount percent applied (0..100) */
  @Prop({ type: Number, min: 0, max: 100, default: 0 })
  discount!: number;

  /** Affiliate who referred the buyer (optional) */
  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  affiliate?: Types.ObjectId;

  /** When the buyer placed the order (explicit; also have createdAt from timestamps) */
  @Prop({ type: Date, default: Date.now })
  orderedAt!: Date;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

/** Indexes */
OrderSchema.index({ user: 1, idempotencyKey: 1 }, { unique: true });
OrderSchema.index({ user: 1, product: 1, orderedAt: -1 });
