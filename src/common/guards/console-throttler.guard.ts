import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

import { extractBearerToken } from '../auth/safetyscore-token';
import { sha256Hex } from '../crypto/hash.util';

/**
 * v2 throttle tracker: authenticated requests are bucketed per
 * (token, agentId) instead of per (ip, device) so ten EAs never share one
 * command budget. The bearer is hashed (never stored raw); rotation of the
 * hourly token resets the bucket, which is acceptable. Unauthenticated
 * requests keep the ip|device tracker.
 */
@Injectable()
export class ConsoleThrottlerGuard extends ThrottlerGuard {
    protected async getTracker(req: Request): Promise<string> {
        const bearer = extractBearerToken(
            req.headers['authorization'] as string | undefined,
        );
        const agent =
            (req.params as Record<string, string> | undefined)?.agentId ??
            'global';
        if (bearer) {
            return `tok:${sha256Hex(bearer).slice(0, 16)}|${agent}`;
        }
        const xff = (req.headers['x-forwarded-for'] as string | undefined)
            ?.split(',')[0]
            ?.trim();
        const ip =
            xff ||
            (req.headers['cf-connecting-ip'] as string | undefined) ||
            req.ip ||
            req.socket?.remoteAddress ||
            'unknown';
        const rawDev = String(
            (req.headers['x-device-id'] as string | undefined) ??
                (req as unknown as { cookies?: Record<string, string> }).cookies
                    ?.device_id ??
                '',
        );
        const devHash =
            rawDev && rawDev.length >= 8 && rawDev.length <= 128
                ? sha256Hex(rawDev)
                : 'no-dev';
        return `${ip}|${devHash}`;
    }
}
