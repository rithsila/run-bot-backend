// src/memberships/memberships.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, PaginateModel, Types } from 'mongoose';
import paginate from 'mongoose-paginate-v2';
import { User } from 'src/user/user.schema';
import { Referral } from './referral.schema';

export type MembershipDocument = Membership & Document;
export type MembershipPaginateModel = PaginateModel<MembershipDocument>;

export enum MembershipStatus {
  Request = 'Request',
  Verified = 'Verified',
  Rejected = 'Rejected',
  Ended = 'Ended',
}

@Schema({ _id: true })
export class MembershipAccount {
  @Prop({
    type: String,
    trim: true,
    required: true,
    maxlength: 120,
  })
  account!: string;

  @Prop({
    type: Boolean,
    default: false,
  })
  isVerified!: boolean;
}

export const MembershipAccountSchema =
  SchemaFactory.createForClass(MembershipAccount);

@Schema({ collection: 'memberships', timestamps: true, versionKey: false })
export class Membership {
  @Prop({
    type: String,
    trim: true,
    lowercase: true,
    index: true,
    unique: true,
    required: true,
  })
  email!: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    index: true,
    required: true,
  })
  user!: User;

  @Prop({
    type: String,
    enum: Object.values(MembershipStatus),
    default: MembershipStatus.Request,
    index: true,
  })
  status!: MembershipStatus;

  @Prop({ type: String, trim: true })
  notes?: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'Referral',
    index: true,
    required: false,
  })
  referral?: Types.ObjectId | Referral;

  @Prop({ type: String, trim: true })
  adminNotes?: string;

  // 🔹 accounts is now an array of { _id, account, isVerified }
  @Prop({
    type: [MembershipAccountSchema],
    default: [],
    validate: {
      validator: (v: MembershipAccount[] | undefined) =>
        Array.isArray(v) && v.length <= 10,
      message: 'accounts can contain at most 10 items',
    },
  })
  accounts!: MembershipAccount[];

  @Prop({
    type: String,
    trim: true,
    index: true,
    unique: true,
    sparse: true,
  })
  licenseKey?: string;

  @Prop({ type: String, trim: true, maxlength: 200, default: null })
  xForwardedFor?: string | null;
}

export const MembershipSchema = SchemaFactory.createForClass(Membership);
MembershipSchema.plugin(paginate);
export type MembershipAccountType = MembershipAccount;
MembershipSchema.index({ user: 1, status: 1 });
MembershipSchema.index({ referral: 1 });
