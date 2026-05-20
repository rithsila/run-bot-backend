// auth/internal-hmac.guard.ts
import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
} from '@nestjs/common';
import * as crypto from 'crypto';

const stable = (v: any): string => {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    return (
        '{' +
        Object.entries(v)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([k, val]) => JSON.stringify(k) + ':' + stable(val))
            .join(',') +
        '}'
    );
};

@Injectable()
export class InternalHmacGuard implements CanActivate {
    private readonly secret: string;

    constructor() {
        const secret = process.env.INTERNAL_HMAC_SECRET;
        if (!secret) {
            throw new Error(
                'INTERNAL_HMAC_SECRET is not set; refusing to start InternalHmacGuard with an empty key',
            );
        }
        this.secret = secret;
    }

    canActivate(ctx: ExecutionContext): boolean {
        const req = ctx.switchToHttp().getRequest<any>();
        const ts = req.headers['x-internal-timestamp'] as string | undefined;
        const sig = req.headers['x-internal-signature'] as string | undefined;
        if (!ts || !sig) throw new ForbiddenException('Missing internal auth');

        const now = Date.now();
        const skew = 5 * 60 * 1000; // 5 min
        const age = Math.abs(now - Number(ts));
        if (!Number.isFinite(Number(ts)) || age > skew) {
            throw new ForbiddenException('Stale request');
        }

        const expect = crypto
            .createHmac('sha256', this.secret)
            .update(ts + '\n' + stable(req.body ?? {}))
            .digest('hex');

        if (expect !== sig) throw new ForbiddenException('Bad signature');
        return true;
    }
}
