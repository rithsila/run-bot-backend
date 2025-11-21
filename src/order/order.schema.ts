// order.schema.ts (or wherever your OrderSchema is defined)
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
  timestamps: true,
})
export class Order {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product', required: true, index: true })
  product!: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(OrderStatus),
    default: OrderStatus.INIT,
    index: true,
  })
  status!: OrderStatus;

  @Prop({ type: String, required: true, trim: true })
  idempotencyKey!: string;

  @Prop({ type: String, required: true, unique: true, trim: true })
  orderId!: string;

  @Prop({ type: Number, required: true, min: 1 })
  billingPeriod!: number;

  @Prop({ type: Number, required: true, min: 0 })
  amount!: number;

  @Prop({ type: String, trim: true, index: true })
  couponCode?: string;

  @Prop({ type: Number, min: 0, max: 100, default: 0 })
  discount!: number;

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  affiliate?: Types.ObjectId;

  @Prop({ type: String, trim: true })
  tvUsernameAck?: string;

  @Prop({ type: Date, default: Date.now })
  orderedAt!: Date;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

/** Existing indexes */
OrderSchema.index({ user: 1, idempotencyKey: 1 }, { unique: true });
OrderSchema.index({ user: 1, product: 1, orderedAt: -1 });

/** NEW: only one INIT/UNPAID order per (user, product) */
OrderSchema.index(
  { user: 1, product: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: [OrderStatus.INIT, OrderStatus.UNPAID] },
    },
  },
);
