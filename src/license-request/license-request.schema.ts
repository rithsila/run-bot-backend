// src/license-requests/license-request.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, PaginateModel, Types } from 'mongoose';
import paginate from 'mongoose-paginate-v2'; // ⬅️ add this
import { MembershipStatus } from 'src/referrals/memberships.enum';

export type LicenseRequestDocument = LicenseRequest & Document;
// Optional: export a typed PaginateModel for DI convenience
export type LicenseRequestPaginateModel = PaginateModel<LicenseRequestDocument>;

@Schema({ collection: 'license_requests', timestamps: true })
export class LicenseRequest {
  // Account Numbers
  @Prop({ type: String, trim: true, maxlength: 50, default: '' })
  accountRiskManager!: string;

  @Prop({ type: String, trim: true, maxlength: 50, default: '' })
  accountSn1p3rConcept!: string;

  @Prop({ type: String, trim: true, maxlength: 50, default: '' })
  accountSn1p3rShot!: string;

  // Bank & TradingView
  @Prop({ type: String, trim: true, maxlength: 120, required: true })
  bankAccountName!: string;

  @Prop({ type: String, trim: true, maxlength: 60, required: true, lowercase: true })
  tradingViewUsername!: string;

  // User-provided notes (optional)
  @Prop({ type: String, trim: true, maxlength: 500, default: '' })
  notes!: string;

  // License Keys (usually set when approved)
  @Prop({ type: String, trim: true, maxlength: 120, default: '' })
  licenseRiskManager!: string;

  @Prop({ type: String, trim: true, maxlength: 120, default: '' })
  licenseSn1p3rConcept!: string;

  @Prop({ type: String, trim: true, maxlength: 120, default: '' })
  licenseSn1p3rShot!: string;

  // Relations
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  approvedBy?: Types.ObjectId | null;

  // Status
  @Prop({
    type: String,
    enum: Object.values(MembershipStatus),
    default: MembershipStatus.Request,
    index: true,
  })
  status!: MembershipStatus;

  // Optional audit fields
  @Prop({ type: Date, default: null })
  approvedAt?: Date | null;

  // Admin-only notes (internal)
  @Prop({ type: String, trim: true, maxlength: 500, default: '' })
  adminNotes!: string;

  @Prop({ type: Date, required: true, index: true })
  createdAt!: Date;
}

export const LicenseRequestSchema = SchemaFactory.createForClass(LicenseRequest);

// ⬇️ enable pagination
LicenseRequestSchema.plugin(paginate);

// Helpful indexes for common queries
LicenseRequestSchema.index({ user: 1, createdAt: -1 });
LicenseRequestSchema.index({ status: 1, createdAt: -1 });
