// src/user/user.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Role } from './roles.enum';
import { SignInMethod } from '../auth/signin-method.enum';

export type UserDocument = HydratedDocument<User>;

@Schema({ _id: false })
export class SignupMeta {
  @Prop({ type: String, default: null, select: false })
  deviceIdHash?: string | null;

  @Prop({ type: String, default: null, select: false })
  ipHash?: string | null;

  @Prop({ type: String, maxlength: 200, default: null })
  userAgent?: string | null;

  @Prop({ type: String, maxlength: 200, default: null })
  referer?: string | null;

  @Prop({ type: Number, default: null })
  renderedAtMs?: number | null;

  @Prop({ type: Number, default: null })
  submittedAtMs?: number | null;
}

export const SignupMetaSchema = SchemaFactory.createForClass(SignupMeta);

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true })
  firstName: string;

  @Prop({ trim: true })
  lastName?: string;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: 120,
    match: [/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Invalid email format'],
  })
  email: string;

  @Prop({ required: true, unique: true, index: true })
  emailCanonical: string;

  @Prop({ type: Boolean, default: false })
  emailVerified?: boolean;

  @Prop()
  photoURL?: string;

  @Prop({ required: false, select: false }) 
  passwordHash?: string;

  @Prop({ required: false, default: SignInMethod.Password, enum: SignInMethod })
  signInMethod?: SignInMethod;

  @Prop({ type: String, enum: Role, default: Role.Student })
  role: Role;

  @Prop({ type: Date })
  lastActiveAt?: Date;

  @Prop({ type: Date })
  lastLoginAt?: Date;

  @Prop({ type: Number, default: 0 })
  failedLoginAttempts?: number;

  @Prop({ type: Date })
  lockedUntil?: Date;

  @Prop({ type: Date })
  passwordChangedAt?: Date;

  // OAuth provider IDs (Google “sub”)
  @Prop({ type: String, required: false, index: true, unique: true, sparse: true })
  googleId?: string;

  @Prop({ type: SignupMetaSchema, required: false })
  signupMeta?: SignupMeta;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.pre('validate', function (next) {
  if (this.firstName) this.firstName = this.firstName.trim();
  if (this.lastName) this.lastName = this.lastName.trim();
  if (this.email) this.email = this.email.trim().toLowerCase();
  (this as any).emailCanonical = (this as any).email; // mirror
  next();
});
// helpful indexes for dashboards/filters
UserSchema.index({ role: 1 });
UserSchema.index({ lastActiveAt: -1 });


