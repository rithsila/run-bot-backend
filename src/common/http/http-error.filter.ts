// src/common/filters/http-error.filter.ts
import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { subnet24 } from 'src/common/risk/risk.utils';

@Catch(HttpException)
export class HttpErrorFilter implements ExceptionFilter {
    catch(exception: HttpException, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const req = ctx.getRequest<
            Request & { __risk?: Record<string, any> }
        >();
        const res = ctx.getResponse<Response>();

        const status = exception.getStatus?.() ?? 500;
        const body = exception.getResponse?.() as any; // may be string | object
        const isObj = typeof body === 'object' && body !== null;
        const isProd = process.env.NODE_ENV === 'production';

        // ── 429 telemetry (unchanged) ───────────────────────────────────────────────
        if (status === 429) {
            const r = req.__risk || {};
            console.warn(
                JSON.stringify({
                    evt: 'rate_limit',
                    path: req.originalUrl || req.url,
                    ip: r.ip || null,
                    ip_subnet24: r.ip ? subnet24(String(r.ip)) : null,
                    deviceIdHash: r.deviceIdHash || null,
                    emailHash: r.emailHash || null,
                    uaHash: r.uaHash || null,
                    domain: r.domain || null,
                    reason: r.reason || 'throttle',
                    ts: new Date().toISOString(),
                }),
            );
        } else {
            // ── diagnostics for non-429 ──────────────────────────────────────────────
            const url = req.originalUrl || req.url;
            const method = req.method;
            const keys = Object.keys(
                (req.body as Record<string, unknown>) || {},
            );
            const respMsg = Array.isArray(body?.message)
                ? body.message
                : body?.message;

            console.error('[ERR]', {
                pid: process.pid,
                method,
                url,
                status,
                bodyKeys: keys,
                exceptionName: exception.name,
                exceptionResponse: {
                    error: body?.error,
                    message: respMsg,
                    statusCode: body?.statusCode ?? status,
                    code: body?.code,
                },
                headers: {
                    'content-type': req.headers['content-type'],
                    origin: req.headers['origin'],
                    'x-device-id': req.headers['x-device-id'],
                },
            });
        }

        // ── Normalize fields ───────────────────────────────────────────────────────
        const codeFromBody: string | undefined = isObj ? body.code : undefined;
        const defaultCode =
            status === 400
                ? 'BAD_REQUEST'
                : status === 401
                  ? 'AUTH_UNAUTHORIZED'
                  : status === 403
                    ? 'FORBIDDEN'
                    : status === 404
                      ? 'NOT_FOUND'
                      : status === 409
                        ? 'CONFLICT'
                        : status === 422
                          ? 'UNPROCESSABLE_ENTITY'
                          : status === 429
                            ? 'RATE_LIMITED'
                            : status >= 500
                              ? 'INTERNAL_ERROR'
                              : 'HTTP_ERROR';

        const code = codeFromBody ?? defaultCode;

        // ── Build safe message & details ──────────────────────────────────────────
        const rawMsg = Array.isArray(body?.message)
            ? body.message
            : isObj
              ? body?.message
              : undefined;

        let message: string;
        let details: string[] | undefined;

        if (status === 429) {
            // Rate limit message (same in all envs)
            message = 'Too many requests. Try again later.';
        } else if (isProd) {
            // In production: keep responses generic,
            // EXCEPT for 401 where we want a friendly login message
            if (status === 401) {
                // If your UnauthorizedException provided a message, use it
                if (typeof rawMsg === 'string' && rawMsg.trim().length > 0) {
                    message = rawMsg;
                } else {
                    // Fallback if nothing custom was provided
                    message = 'Invalid email or password.';
                }
            } else if (status === 404) {
                message = 'Resource not found';
            } else if (status === 403) {
                message = 'Forbidden';
            } else if (status === 400 || status === 422) {
                if (typeof rawMsg === 'string' && rawMsg.trim().length > 0) {
                    message = rawMsg;
                } else {
                    // Fallback if nothing custom was provided
                    message = 'Invalid email or password.';
                }
            } else if (status >= 500) {
                message = 'Unexpected error';
            } else {
                message = 'Request failed';
            }

            // In prod we do NOT expose detailed validation messages
            details = undefined;
        } else {
            // In dev/staging: keep your current detailed behavior
            message = Array.isArray(rawMsg)
                ? rawMsg.join('; ')
                : rawMsg || exception.message || 'Error';

            // Keep validation details for easier debugging in non-prod
            details = Array.isArray(body?.message) ? body.message : undefined;
        }

        // error field: generic for 5xx in prod, more detailed otherwise
        const errorField =
            status === 429
                ? 'TooManyRequests'
                : isProd && status >= 500
                  ? 'InternalError'
                  : body?.error || exception.name;

        res.status(status).json({
            success: false,
            statusCode: status,
            code,
            message,
            error: errorField,
            ...(details && !isProd ? { details } : {}),
            timestamp: new Date().toISOString(),
            path: req.originalUrl || req.url,
        });
    }
}
