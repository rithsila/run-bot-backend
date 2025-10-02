// src/auth/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptions } from 'passport-jwt';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { Role } from 'src/user/roles.enum';

function cookieExtractor(req: Request) {
  return (req?.cookies?.accessToken as string) || null;
}

// Decode base64 → utf8 string, no PEM enforcement
function fromB64EnvOrThrow(cfg: ConfigService, name: string): string {
  const v = cfg.get<string>(name);
  if (!v) throw new Error(`Missing env ${name}`);
  return Buffer.from(v, 'base64').toString('utf8').trim();
}

export type AppAudience = 'admin' | 'student' | 'instructor';

export interface AccessJwtPayload {
  sub: string;
  email: string;
  role?: Role;
  perms?: string[];
  // allow array just in case other issuers send aud as an array
  aud?: AppAudience | AppAudience[] | string | string[];
  typ?: 'access' | string;
  iat?: number;
  exp?: number;
  iss?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt-bearer') {
  constructor(private readonly cfg: ConfigService) {
    const publicKey = fromB64EnvOrThrow(cfg, 'JWT_ACCESS_PUBLIC_KEY_BASE64');

    const alg = (cfg.get<string>('JWT_ALG') || 'RS256').toUpperCase();
    if (alg !== 'RS256') {
      throw new Error(`Unsupported JWT_ALG ${alg}; expected RS256`);
    }

    const opts: StrategyOptions = {
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        cookieExtractor,
      ]),
      ignoreExpiration: false,
      secretOrKey: publicKey,            // must be valid RSA public key content
      algorithms: [alg],
      issuer: cfg.get<string>('JWT_ISSUER') || undefined,
      // audience: (omit; we enforce per route with AppGuard)
      passReqToCallback: false,
    };

    super(opts);
  }

  async validate(payload: AccessJwtPayload) {
    if (!payload?.sub) {
      throw new UnauthorizedException('Invalid token (sub missing)');
    }
    if (payload.typ && payload.typ !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    // Normalize role (single enum)
    const role: Role = payload.role ?? Role.Student;

    // Normalize aud (string | string[])
    let aud: AppAudience | undefined;
    if (Array.isArray(payload.aud)) {
      aud = payload.aud[0] as AppAudience;
    } else if (typeof payload.aud === 'string') {
      // coerce to our union if an arbitrary string was provided
      const lower = payload.aud.toLowerCase();
      if (lower === 'admin' || lower === 'student' || lower === 'instructor') {
        aud = lower as AppAudience;
      }
    }

    return {
      userId: payload.sub,
      email: payload.email,
      role,                 // for RolesGuard
      perms: payload.perms ?? [],
      aud,                  // for AppGuard (may be undefined if issuer omitted it)
    };
  }
}
