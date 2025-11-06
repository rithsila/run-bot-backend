// src/memberships/membership.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, PaginateModel, Types } from 'mongoose';
import paginate from 'mongoose-paginate-v2';

export type MembershipDocument = Membership & Document;
export type MembershipPaginateModel = PaginateModel<MembershipDocument>;

export enum MembershipStatus {
  Request = 'Request',
  Verified = 'Verified',
  Rejected = 'Rejected',
  Ended = 'Ended',
}

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
  user!: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(MembershipStatus),
    default: MembershipStatus.Request,
    index: true
  })
  status!: MembershipStatus;

  @Prop({ type: String, trim: true })
  notes?: string;

  @Prop({ type: String, trim: true })
  referral?: string;

  @Prop({ type: String, trim: true })
  adminNotes?: string;

  @Prop({ type: [String], default: [] })
  accounts?: string[];
}

export const MembershipSchema = SchemaFactory.createForClass(Membership);
MembershipSchema.plugin(paginate);

MembershipSchema.index({ user: 1, status: 1 });

