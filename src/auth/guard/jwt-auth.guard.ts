// src/auth/jwt-auth.guard.ts
import {
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';
import type { Request } from 'express';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt-bearer') {
    constructor(private reflector: Reflector) {
        super();
    }

    canActivate(context: ExecutionContext) {
        const isPublic = this.reflector.getAllAndOverride<boolean>(
            IS_PUBLIC_KEY,
            [context.getHandler(), context.getClass()],
        );
        if (isPublic) return true;
        return super.canActivate(context);
    }

    handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
        if (err || !user) {
            const req = context.switchToHttp().getRequest<Request>();
            const hasAuthHeader = !!req.headers['authorization'];
            const hasCookie = !!req.cookies?.accessToken;

            // Prefer classifying by the jwt error when present
            const jwtName = info?.name; // TokenExpiredError | JsonWebTokenError | NotBeforeError | undefined
            const code =
                jwtName === 'TokenExpiredError'
                    ? 'AUTH_TOKEN_EXPIRED'
                    : jwtName === 'JsonWebTokenError'
                      ? 'AUTH_TOKEN_INVALID'
                      : // if no jwt error surfaced, classify by what was provided
                        hasAuthHeader || hasCookie
                        ? 'AUTH_UNAUTHORIZED'
                        : 'AUTH_REQUIRED';

            const message =
                code === 'AUTH_REQUIRED'
                    ? 'You must sign in to access this feature.'
                    : code === 'AUTH_TOKEN_EXPIRED'
                      ? 'Your session has expired. Please sign in again.'
                      : code === 'AUTH_TOKEN_INVALID'
                        ? 'Invalid or malformed token.'
                        : 'Unauthorized access.';
            throw new UnauthorizedException({ code, message });
        }
        return user;
    }
}
