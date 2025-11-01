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
    type: String,
    trim: true,
    maxlength: 60,
    match: [/^[A-Za-z0-9._-]{1,60}$/, 'Invalid Sn1p3r Concept account'],
    index: true,
  })
  sn1p3rConceptAccount?: string;

  @Prop({
    type: String,
    trim: true,
    maxlength: 60,
    match: [/^[A-Za-z0-9._-]{1,60}$/, 'Invalid Risk Manager account'],
    index: true,
  })
  riskManagerAccount?: string;

  @Prop({
    type: String,
    trim: true,
    maxlength: 60,
    match: [/^[A-Za-z0-9._-]{1,60}$/, 'Invalid Sn1p3r Shot account'],
    index: true,
  })
  sn1p3rShotAccount?: string;

  @Prop({ type: String, enum: MembershipStatus, default: MembershipStatus.Request, index: true })
  status!: MembershipStatus;

  @Prop({ type: String, trim: true, maxlength: 2000 })
  notes?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  approvedBy?: MongooseSchema.Types.ObjectId;
}

export const MembershipSchema = SchemaFactory.createForClass(Membership);
MembershipSchema.plugin(paginate);
MembershipSchema.index({ user: 1 }, { unique: true });
MembershipSchema.index({ email: 1 }, { unique: true });
