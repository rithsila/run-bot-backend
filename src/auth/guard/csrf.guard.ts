// src/common/guards/csrf.guard.ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { SKIP_CSRF_KEY } from './skip-csrf.decorator';

// tiny util to avoid subtle timing leaks (overkill, but cheap)
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  // XOR char codes; any mismatch flips result
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) { }

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();

    // 1) Allow safe methods
    const method = (req.method || 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;

    // 2) Allow @Public or @SkipCsrf
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (skip) return true;

    // 3) Double-submit cookie check
    //    (req.headers is case-insensitive, but accept both common names)
    const cookieToken = req.cookies?.['XSRF-TOKEN'];

    const headerToken =
      (req.headers['x-csrf-token'] as string | undefined) ??
      (req.headers['x-xsrf-token'] as string | undefined) ??
      '';
  

    if (!cookieToken || !headerToken || !timingSafeEqual(cookieToken, headerToken)) {
      // optional: include hints only in non-production
      const hint =
        process.env.NODE_ENV !== 'production'
          ? ' (ensure you send X-CSRF-Token header equal to XSRF-TOKEN cookie)'
          : '';
      throw new ForbiddenException('Invalid CSRF token' + hint);
    }
    return true;
  }
}
