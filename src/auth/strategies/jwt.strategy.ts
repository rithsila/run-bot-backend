// src/auth/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptions } from 'passport-jwt';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { Role } from 'src/user/user.enum';

// Read access token from Authorization: Bearer <token> or cookie "accessToken"
function cookieExtractor(req: Request) {
  return (req?.cookies?.accessToken as string) || null;
}

// Decode base64 -> utf8 string (no PEM enforcement)
function fromB64EnvOrThrow(cfg: ConfigService, name: string): string {
  const v = cfg.get<string>(name);
  if (!v) throw new Error(`Missing env ${name}`);
  return Buffer.from(v, 'base64').toString('utf8').trim();
}

export interface AccessJwtPayload {
  sub: string;
  email: string;
  role: Role;              // exactly one role required
  perms?: string[];
  typ?: 'access' | string; // must be "access" if present
  iat?: number;
  exp?: number;
  iss?: string;
}

// Shape of req.user (helps TS in guards/controllers)
export interface AuthUser {
  userId: string;
  email: string;
  role: Role;
  perms: string[];
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
      secretOrKey: publicKey,     // RSA public key content (PEM)
      algorithms: [alg],
      issuer: cfg.get<string>('JWT_ISSUER') || undefined,
      passReqToCallback: false,
    };

    super(opts);
  }

  async validate(payload: AccessJwtPayload): Promise<AuthUser> {
    // Basic token sanity checks
    if (!payload?.sub) {
      throw new UnauthorizedException('Invalid token (sub missing)');
    }
    if (payload.typ && payload.typ !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }
    // Enforce exactly-one-role presence
    if (!payload.role) {
      throw new UnauthorizedException('Invalid token (role missing)');
    }

    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,           // single role exposed here
      perms: payload.perms ?? [],
    };
  }
}
