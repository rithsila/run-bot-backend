// src/auth/auth.service.ts
import {
  Injectable,
  Logger,
  InternalServerErrorException,
  UnauthorizedException,
  BadRequestException,
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
import { Role } from 'src/user/roles.enum';


@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // ── NEW: single source of truth for TTL (seconds) + JWT settings ─────────────
  private readonly ACCESS_TTL_SEC = Number(process.env.JWT_ACCESS_TTL ?? 900); // 15m default
  private readonly JWT_ALG = (process.env.JWT_ALG as 'RS256' | 'HS256' | undefined) ?? 'RS256';
  private readonly JWT_ISSUER = process.env.JWT_ISSUER;
  private readonly JWT_AUDIENCE = process.env.JWT_AUDIENCE;

  constructor(
    private readonly users: UserService,
    private readonly jwt: JwtService
  ) { }

  async signup(
    dto: SignupDto,
    reqMeta: Partial<SignupMeta> = {},
  ): Promise<PublicUser> {
    try {
      const email = this.users.normalizeEmail(dto.email);
      this.logger.debug(`Signup attempt email=${maskEmail(email)}`);

      const user = await this.users.create({
        firstName: dto.firstName.trim(),
        lastName: dto.lastName?.trim(),
        email,
        password: dto.password, // hashed in UserService.create
        signInMethod: SignInMethod.Password,
        emailVerified: false,
        signupMeta: {
          // Only server/meta fields here; DTO no longer has userAgent/referer
          userAgent: reqMeta.userAgent ?? null,
          referer: reqMeta.referer ?? null,
          deviceIdHash: reqMeta.deviceIdHash ?? null,
          ipHash: reqMeta.ipHash ?? null,
          renderedAtMs: reqMeta.renderedAtMs ?? null,
          submittedAtMs: reqMeta.submittedAtMs ?? Date.now(),
        },
      });

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
        this.logger.warn(
          `Signup rejected: ${err.status} ${JSON.stringify(err.response)}`,
        );
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
        // this.logger.warn(`Login failed (no user/hash) email=${maskEmail(email)}`);
        throw new UnauthorizedException('Invalid credentials');
      }

      if (this.users.isLocked(authDoc)) {
        const remaining = formatRemainingLockTime(new Date(authDoc.lockedUntil!));
        throw new UnauthorizedException(
          `Too many login attempts. Please try again in ${remaining}.`
        );
      }

      const ok = await argon2.verify(authDoc.passwordHash, dto.password);
      if (!ok) {
        await this.users.recordFailedLogin(String(authDoc._id), { maxAttempts: 5, lockMs: 10 * 60 * 1000 });
        this.logger.warn(
          JSON.stringify({
            evt: 'login_failed',
            email: maskEmail(email),
            ip_subnet24: t?.ip ? subnet24(t.ip) : null,
            deviceIdHash: t?.deviceIdHash ?? null,
            reason: 'bad_password',
          }),
        );
        throw new UnauthorizedException('The password you entered is incorrect. Please try again or reset your password.');
      }

      await this.users.recordSuccessfulLogin(String(authDoc._id));


      const payload = {
        sub: String(authDoc._id),
        email: authDoc.email,
        role: authDoc.role as Role,
        perms: (authDoc as any).perms ?? [], // if you store string[] perms on the user
        typ: 'access' as const,
      };

      // ── centralized signing + numeric seconds TTL ─────────
      const accessToken = await this.signAccessToken(payload);
      if (process.env.JWT_DEBUG_PAYLOAD === '1') this.debugJwt(accessToken);

      const user = this.users.toPublicUser(authDoc);

      // success log with coarse IP/device
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

      // return seconds; controller sets cookie maxAge = seconds * 1000
      return { tokenType: 'Bearer', accessToken, expiresIn: this.ACCESS_TTL_SEC };

    } catch (err: any) {
      if (err?.status) throw err;
      this.logger.error(`Login error email=${maskEmail(email)}: ${err?.message || err}`, err?.stack);
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


  // -----------------------------
  // Helpers (NEW)
  // -----------------------------
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
