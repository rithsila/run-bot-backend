// src/memberships/schemas/membership.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import paginate from 'mongoose-paginate-v2';
import { MembershipStatus } from './memberships.enum';

export type MembershipDocument = Membership & Document;

@Schema({ timestamps: true })
export class Membership {
  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: 120,
    match: [/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Invalid email format'],
    index: true,
  })
  email!: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  user!: MongooseSchema.Types.ObjectId;

  @Prop({ type: String, required: true })
  referral!: string;

  @Prop({
    type: [{ type: String, trim: true, maxlength: 50 }],
    default: [],
    validate: {
      validator: (arr: string[]) =>
        Array.isArray(arr) &&
        arr.every((s) => typeof s === 'string' && /^[A-Za-z0-9._-]{3,50}$/.test(s.trim())),
      message: 'Each account number must be 3–50 chars, alphanumeric plus . _ - only.',
    },
  })
  accountNumbers!: string[];

  @Prop({ type: String, enum: MembershipStatus, default: MembershipStatus.Request, index: true })
  status!: MembershipStatus;

  @Prop({ type: String, trim: true, maxlength: 2000 })
  notes?: string;

  @Prop({ type: String, maxlength: 2000, default: '' })
  adminNotes?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  approvedBy?: MongooseSchema.Types.ObjectId;
}

export const MembershipSchema = SchemaFactory.createForClass(Membership);

MembershipSchema.plugin(paginate);
