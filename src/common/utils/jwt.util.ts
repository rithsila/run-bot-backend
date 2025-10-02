// src/auth/helpers/jwt.util.ts
import { Request } from 'express';
import { ExtractJwt } from 'passport-jwt';

// support both header & cookie
export function extractToken(req: Request): string | null {
  return (
    ExtractJwt.fromAuthHeaderAsBearerToken()(req) ||
    (req.cookies?.accessToken as string) ||
    null
  );
}
