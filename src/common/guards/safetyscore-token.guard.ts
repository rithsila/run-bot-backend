import {
    CanActivate,
    ExecutionContext,
    Injectable,
    Logger,
    UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import {
    extractBearerToken,
    verifySafetyScoreToken,
    type SafetyScoreUser,
} from '../auth/safetyscore-token';

export interface SafetyScoreRequest extends Request {
    user: SafetyScoreUser;
}

/**
 * HTTP guard that trusts tokens signed by SafetyScore (the external authority).
 *
 * Reads a bearer token from the Authorization header, verifies it as an ES256
 * JWT against `SAFETYSCORE_TOKEN_PUBLIC_KEY`, and attaches the normalized user to
 * `request.user`. Replaces the previous JwtAuthGuard/RolesGuard/CsrfGuard stack.
 */
@Injectable()
export class SafetyScoreTokenGuard implements CanActivate {
    private readonly logger = new Logger(SafetyScoreTokenGuard.name);

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const req = context.switchToHttp().getRequest<SafetyScoreRequest>();
        const token = extractBearerToken(req.headers['authorization']);
        if (!token) {
            throw new UnauthorizedException({
                code: 'AUTH_REQUIRED',
                message: 'You must provide a SafetyScore token.',
            });
        }
        try {
            req.user = await verifySafetyScoreToken(token);
        } catch (e) {
            this.logger.warn(
                `Rejected SafetyScore token: ${e instanceof Error ? e.message : String(e)}`,
            );
            throw new UnauthorizedException({
                code: 'AUTH_TOKEN_INVALID',
                message: 'Invalid or expired token.',
            });
        }
        return true;
    }
}
