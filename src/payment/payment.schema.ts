// src/payments/schemas/payment.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import paginate from 'mongoose-paginate-v2';
import { PaymentMethod, PaymentStatus } from './payments.enum';
import { User } from 'src/user/user.schema';

export type PaymentDocument = Payment & Document;

@Schema({ timestamps: true })
export class Payment {
  /** Buyer (auto-populated with safe fields) */
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
    autopopulate: { select: 'firstName lastName email photoURL role lastActiveAt' },
  })
  user!: MongooseSchema.Types.ObjectId | User;

  /** The plan purchased (auto-populated) */
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Plan',
    index: true,
    autopopulate: { select: 'title price billingPeriod category marketingTagline' },
  })
  plan?: MongooseSchema.Types.ObjectId;

  /**
   * Amount (store as an integer in your smallest unit, e.g. cents or riel).
   * Example: $19.99 => 1999; KHR often uses no decimals.
   */
  @Prop({
    type: Number,
    required: true,
    min: [0, 'Amount must be >= 0'],
    validate: { validator: Number.isInteger, message: 'amount must be an integer.' },
  })
  amount!: number;

  /** Payment state */
  @Prop({ type: String, enum: PaymentStatus, default: PaymentStatus.Initiated, index: true })
  status!: PaymentStatus;

  /** How the user paid */
  @Prop({ type: String, enum: PaymentMethod, required: true, index: true })
  method!: PaymentMethod;

  /** IP address of payer */
  @Prop({ type: String, trim: true, maxlength: 45, match: [/^([0-9a-f:.]+)?$/i, 'Invalid IP'] })
  ipAddress?: string;

  /** Expiration for pending/hold transactions */
  @Prop({ type: Date })
  expiresAt?: Date;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);

/* ---------- Indexes & Plugins ---------- */

// Common queries
PaymentSchema.index({ user: 1, createdAt: -1 });
PaymentSchema.index({ status: 1, createdAt: -1 });

// TTL on expirations (only when set)
PaymentSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, partialFilterExpression: { expiresAt: { $type: 'date' } } },
);

// Plugins
PaymentSchema.plugin(paginate);
