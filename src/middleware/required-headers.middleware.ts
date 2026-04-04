// src/middleware/required-headers.middleware.ts
import {
    BadRequestException,
    Injectable,
    NestMiddleware,
} from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const SKIP = (req: Request) =>
    req.method === 'OPTIONS' ||
    req.url === '/health' ||
    req.url.startsWith('/_next') ||
    req.url.startsWith('/static') ||
    req.url.startsWith('/favicon.ico');

@Injectable()
export class RequiredHeadersMiddleware implements NestMiddleware {
    use(req: Request, _res: Response, next: NextFunction) {
        if (SKIP(req)) return next();

        // Ensure a request id exists (don’t reject if missing; just set it)
        if (!req.headers['x-request-id']) {
            req.headers['x-request-id'] = crypto.randomUUID();
        }

        const method = req.method;
        const mutating =
            method === 'POST' ||
            method === 'PUT' ||
            method === 'PATCH' ||
            method === 'DELETE';
        const hasCookies = Boolean((req as any).headers.cookie);

        if (mutating && hasCookies) {
            if (!req.headers['x-csrf-token'])
                throw new BadRequestException('Missing X-CSRF-Token');
        }

        return next();
    }
}
