// src/auth/auth.service.ts
import {
  Injectable,
  Logger,
  InternalServerErrorException,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { UserService } from '../user/user.service';
import { SignupDto } from './dto/signup.dto';
import { SignInMethod } from 'src/auth/signin-method.enum';
import type { SignupMeta } from 'src/user/user.schema';
import { PublicUser } from 'src/common/types/public-user.type';
import { maskEmail } from 'src/common/utils/email.util';
import * as argon2 from 'argon2';
import { fromB64Env } from 'src/common/utils/env.util';
import { JwtService } from '@nestjs/jwt';
import { subnet24 } from 'src/common/risk/risk.utils';
import { LoginDto } from './dto/login.dto';
import { LoginTelemetry } from 'src/common/types/login-telemetry.type';
import { formatRemainingLockTime } from 'src/common/utils/time.util';
import { GoogleUserPayload } from 'src/common/types/google-auth.type';
import { Role } from 'src/user/user.enum';
import { InjectModel } from '@nestjs/mongoose';
import { EmailVerificationToken, EmailVerificationTokenDocument } from './email-verification-token.schema';
import { MailService } from 'src/mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { sha256Hex } from 'src/common/crypto/hash.util';
import { randomBytes } from 'crypto';
import { PasswordResetToken, PasswordResetTokenDocument } from './password-reset-token.schema';


@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private readonly ACCESS_TTL_SEC = Number(process.env.JWT_ACCESS_TTL ?? 900); // 15m
  private readonly JWT_ALG = (process.env.JWT_ALG as 'RS256' | 'HS256' | undefined) ?? 'RS256';
  private readonly JWT_ISSUER = process.env.JWT_ISSUER;
  private readonly VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
  private readonly RESET_TTL_MS =
    Number(process.env.PW_RESET_TTL_MIN ?? 20) * 60 * 1000; // 20m default

  private appHost!: string;

  constructor(
    private readonly users: UserService,
    private readonly jwt: JwtService,
    @InjectModel(EmailVerificationToken.name)
    private readonly verifyModel: Model<EmailVerificationTokenDocument>,
    @InjectModel(PasswordResetToken.name)
    private readonly pwResetModel: Model<PasswordResetTokenDocument>,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {
    this.appHost = this.config.get<string>('FRONTEND_URL') || 'https://app.example.com';
  }

  private newToken() {
    return randomBytes(32).toString('base64url');
  }

  private async issueAndSendEmailVerification(
    userId: Types.ObjectId,
    email: string,
    ip?: string,
    ua?: string,
  ) {
    // invalidate any active tokens
    await this.verifyModel.updateMany(
      { userId, usedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { expiresAt: new Date() } },
    );

    const raw = this.newToken();
    const tokenHash = sha256Hex(raw);

    await this.verifyModel.create({
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + this.VERIFY_TTL_MS),
      issuedIp: ip,
      issuedUa: ua,
    });
    const link = `${this.appHost}/verify-email?token=${raw}`;
    try {
      await this.mail.sendEmailVerification(email, link);
    } catch (e) {
      // best-effort: don't fail signup just because email send errored
      this.logger.warn(
        `sendEmailVerification failed for ${maskEmail(email)}: ${(e as Error)?.message}`,
      );
    }
  }

  private async issueAndSendPasswordReset(
    userId: Types.ObjectId,
    email: string,
    ip?: string,
    ua?: string,
  ) {
    // Invalidate any currently-active reset tokens
    await this.pwResetModel.updateMany(
      { userId, usedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { expiresAt: new Date() } },
    );

    const raw = this.newToken();
    const tokenHash = sha256Hex(raw);

    await this.pwResetModel.create({
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + this.RESET_TTL_MS),
      issuedIp: ip,
      issuedUa: ua,
      reason: 'forgot',
    });

    // Prefer path-style link; keep ?email to enable one-click resend UX on the page
    const link = `${this.appHost}/reset-password/${raw}?email=${encodeURIComponent(email)}`;

    try {
      await this.mail.sendPasswordReset(email, link);
    } catch (e) {
      this.logger.warn(
        `sendPasswordReset failed for ${maskEmail(email)}: ${(e as Error)?.message}`,
      );
    }
  }


  async signup(
    dto: SignupDto,
    reqMeta: Partial<SignupMeta> = {},
  ): Promise<PublicUser> {
    const email = this.users.normalizeEmail(dto.email);
    const isExisting = await this.users.findByEmail(email);
    if (isExisting) {
      throw new ConflictException('Email already registered!');
    }

    try {

      this.logger.debug(`Signup attempt email=${maskEmail(email)}`);

      const user = await this.users.create({
        firstName: dto.firstName.trim(),
        lastName: dto.lastName?.trim(),
        email,
        password: dto.password, // hashed in UserService.create
        signInMethod: SignInMethod.Password,
        emailVerified: false,
        signupMeta: {
          userAgent: reqMeta.userAgent ?? null,
          referer: reqMeta.referer ?? null,
          deviceIdHash: reqMeta.deviceIdHash ?? null,
          ipHash: reqMeta.ipHash ?? null,
          renderedAtMs: reqMeta.renderedAtMs ?? null,
          submittedAtMs: reqMeta.submittedAtMs ?? Date.now(),
        },
      });

      // NEW: issue token + send verification email (best-effort)
      await this.issueAndSendEmailVerification(
        new Types.ObjectId((user as any)._id ?? (user as any).id),
        user.email,
        undefined, // pass raw IP if you capture it elsewhere
        reqMeta.userAgent ?? undefined,
      );

      const publicUser: PublicUser = {
        _id: String((user as any).id ?? (user as any)._id),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role as any,
        emailVerified: user.emailVerified || false,
      };

      this.logger.log(
        `Signup success id=${publicUser._id} email=${maskEmail(publicUser.email)}`,
      );

      return publicUser;
    } catch (err: any) {
      if (err?.status && err?.response) {
        this.logger.warn(`Signup rejected: ${err.status} ${JSON.stringify(err.response)}`);
        throw err;
      }
      this.logger.error(
        `Signup failed for email=${maskEmail(dto.email)}: ${err?.message || err}`,
        err?.stack,
      );
      throw new InternalServerErrorException('Unable to create user');
    }
  }

  async login(
    dto: LoginDto,
    t?: LoginTelemetry,
  ): Promise<{ tokenType: 'Bearer'; accessToken: string; expiresIn: number }> {
    const email = this.users.normalizeEmail(dto.email);

    try {
      const authDoc = await this.users.getAuthForLoginByEmail(email);

      if (!authDoc) {
        this.logger.warn(`We couldn’t find an account with that email=${maskEmail(email)}`);
        throw new UnauthorizedException('We couldn’t find an account with that email.Please check and try again.');
      }

      if (authDoc?.signInMethod != SignInMethod.Password) {
        throw new BadRequestException(
          `This account was created with ${authDoc?.signInMethod} sign-in.`,
        );
      }

      if (!authDoc?.passwordHash) {
        throw new UnauthorizedException('Invalid credentials');
      }

      // 🔒 already locked? bail out early
      if (this.users.isLocked(authDoc)) {
        const remaining = formatRemainingLockTime(new Date(authDoc.lockedUntil!));
        throw new UnauthorizedException(
          `Too many login attempts. Please try again in ${remaining}.`
        );
      }

      // ✅ check password
      const ok = await argon2.verify(authDoc.passwordHash, dto.password);
      if (!ok) {
        // wrong password → count towards lock
        await this.users.recordFailedLogin(String(authDoc._id), {
          maxAttempts: 5,
          lockMs: 10 * 60 * 1000,
        });

        this.logger.warn(
          JSON.stringify({
            evt: 'login_failed',
            email: maskEmail(email),
            ip_subnet24: t?.ip ? subnet24(t.ip) : null,
            deviceIdHash: t?.deviceIdHash ?? null,
            reason: 'bad_password',
          }),
        );

        throw new UnauthorizedException(
          'The password you entered is incorrect. Please try again or reset your password.',
        );
      }

      // 🚨 password is correct but email is NOT verified
      if (!authDoc.emailVerified) {
        // Treat this as a "failed" attempt for locking purposes
        await this.users.recordFailedLogin(String(authDoc._id), {
          maxAttempts: 5,                 // you can tune this separately if you want
          lockMs: 10 * 60 * 1000,         // e.g. 10 minutes
        });

        this.logger.warn(
          JSON.stringify({
            evt: 'login_failed',
            email: maskEmail(email),
            ip_subnet24: t?.ip ? subnet24(t.ip) : null,
            deviceIdHash: t?.deviceIdHash ?? null,
            reason: 'email_not_verified',
          }),
        );

        // try to resend verification email
        try {
          await this.issueAndSendEmailVerification(
            new (require('mongoose').Types.ObjectId)(String(authDoc._id)),
            authDoc.email,
            undefined,
          );
        } catch (e) {
          this.logger.warn(
            `auto-resend verify failed for ${maskEmail(authDoc.email)}: ${(e as Error)?.message}`,
          );
        }

        // user will hit the "Too many login attempts" branch once locked
        throw new UnauthorizedException(
          'Please verify your email to continue. We just sent you a new verification link.',
        );
      }

      // 🎉 fully OK: verified + correct password
      await this.users.recordSuccessfulLogin(String(authDoc._id));

      const payload = {
        sub: String(authDoc._id),
        email: authDoc.email,
        role: authDoc.role as Role,
        perms: (authDoc as any).perms ?? [],
        typ: 'access' as const,
      };

      const accessToken = await this.signAccessToken(payload);
      if (process.env.JWT_DEBUG_PAYLOAD === '1') this.debugJwt(accessToken);

      const user = this.users.toPublicUser(authDoc);

      this.logger.log(
        JSON.stringify({
          evt: 'login_success',
          _id: user._id,
          email: maskEmail(user.email),
          ip_subnet24: t?.ip ? subnet24(t.ip) : null,
          deviceIdHash: t?.deviceIdHash ?? null,
          role: authDoc.role,
        }),
      );

      return { tokenType: 'Bearer', accessToken, expiresIn: this.ACCESS_TTL_SEC };
    } catch (err: any) {
      if (err?.status) throw err;
      this.logger.error(
        `Login error email=${maskEmail(email)}: ${err?.message || err}`,
        err?.stack,
      );
      throw new InternalServerErrorException('Unable to login');
    }
  }


  async handleGoogleLogin(
    google: GoogleUserPayload,
  ): Promise<{
    tokenType: 'Bearer';
    accessToken: string;
    expiresIn: number;
    user?: PublicUser;
  }> {
    if (!google?.googleId) {
      throw new UnauthorizedException('Invalid Google profile');
    }

    const userDoc = await this.users.upsertGoogleUser({
      googleId: google.googleId,
      email: google.email,
      firstName: google.firstName,
      lastName: google.lastName,
      photoURL: google.photoURL,
    });

    // enforce mapping (most Google signups are Students by default)
    const userRole = userDoc.role as Role;


    // --- issue access JWT exactly like /login ---
    const payload = {
      sub: String(userDoc._id),
      email: userDoc.email,
      role: userRole,
      perms: (userDoc as any).perms ?? [],
      typ: 'access' as const,
    };

    const accessToken = await this.signAccessToken(payload);
    if (process.env.JWT_DEBUG_PAYLOAD === '1') this.debugJwt(accessToken);

    const publicUser = this.users.toPublicUser(userDoc);

    this.logger.log(
      JSON.stringify({
        evt: 'oauth_google_success',
        _id: publicUser._id,
        email: maskEmail(publicUser.email),
        role: userRole,
      }),
    );

    return {
      tokenType: 'Bearer',
      accessToken,
      expiresIn: this.ACCESS_TTL_SEC,
    };
  }

  async verifyEmail(rawToken: string): Promise<void> {

    if (!rawToken || typeof rawToken !== 'string') {
      throw new BadRequestException('Invalid or expired token');
    }

    const tokenHash = sha256Hex(rawToken);
    const now = new Date();

    // Atomically consume the token (single-use)
    const rec = await this.verifyModel.findOneAndUpdate(
      { tokenHash, usedAt: null, expiresAt: { $gt: now } },
      { $set: { usedAt: now } },
      { new: false } // we only need the pre-update doc to get userId
    );

    if (!rec) {
      throw new BadRequestException('Invalid or expired token');
    }
    // Mark user as verified
    await this.users.setEmailVerified(String(rec.userId), true);

    this.logger.log(
      JSON.stringify({ evt: 'verify_email_success', userId: String(rec.userId) }),
    );
  }


  async resendVerification(email: string, ip?: string, ua?: string): Promise<void> {
    if (!email) return;
    const normalized = this.users.normalizeEmail(email);
    const user = await this.users.findByEmail(normalized);
    if (!user) return;                 // generic outward response
    if (user.emailVerified) return;    // already verified

    await this.issueAndSendEmailVerification(
      new Types.ObjectId((user as any)._id ?? (user as any).id),
      user.email,
      ip,
      ua,
    );

    this.logger.debug(
      JSON.stringify({ evt: 'verify_email_resent', userId: String((user as any)._id) }),
    );
  }

  async requestPasswordReset(email: string, ip?: string, ua?: string): Promise<void> {
    if (!email) return;

    const normalized = this.users.normalizeEmail(email);
    const user = await this.users.findByEmail(normalized);

    // Enumeration-safe: always return 200 to caller;
    // only proceed internally if user exists and supports password sign-in.
    if (!user || user.signInMethod !== SignInMethod.Password) {
      this.logger.debug(
        JSON.stringify({ evt: 'reset_request_ignored', email: maskEmail(normalized) }),
      );
      return;
    }

    await this.issueAndSendPasswordReset(
      new Types.ObjectId((user as any)._id ?? (user as any).id),
      user.email,
      ip,
      ua,
    );

    this.logger.log(
      JSON.stringify({ evt: 'reset_issued', userId: String((user as any)._id) }),
    );
  }


  private async signAccessToken(payload: {
    sub: string;
    email: string;
    role: Role;
    perms?: string[];
    typ: 'access';
  }): Promise<string> {
    if (this.JWT_ALG !== 'RS256' && this.JWT_ALG !== 'HS256') {
      throw new InternalServerErrorException(`Unsupported JWT_ALG ${this.JWT_ALG}`);
    }

    const opts: Parameters<typeof this.jwt.signAsync>[1] = {
      algorithm: this.JWT_ALG,
      expiresIn: this.ACCESS_TTL_SEC,  // NUMBER (seconds)
      issuer: this.JWT_ISSUER,
    };

    if (this.JWT_ALG === 'RS256') {
      Object.assign(opts, { privateKey: fromB64Env('JWT_ACCESS_PRIVATE_KEY_BASE64') });
    } else {
      Object.assign(opts, { secret: process.env.JWT_ACCESS_SECRET });
    }

    return this.jwt.signAsync(payload, opts);
  }


  private debugJwt(token: string) {
    try {
      const [, bodyB64] = token.split('.');
      const body = JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf8'));
      this.logger.debug({
        evt: 'jwt_payload_debug',
        now: Math.floor(Date.now() / 1000),
        iat: body?.iat,
        exp: body?.exp,
        ttl_sec: (typeof body?.iat === 'number' && typeof body?.exp === 'number')
          ? body.exp - body.iat
          : undefined,
      });
    } catch (e) {
      this.logger.warn(`jwt_payload_debug failed: ${(e as Error).message}`);
    }
  }
}
