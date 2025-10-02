// src/common/filters/http-error.filter.ts
import { ExceptionFilter, Catch, ArgumentsHost, HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { subnet24 } from 'src/common/risk/risk.utils';

@Catch(HttpException)
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & any>();
    const res = ctx.getResponse<Response>();

    const status = exception.getStatus?.() ?? 500;
    const body = exception.getResponse?.() as any; // may be string | object

    // ── 429 telemetry (unchanged) ───────────────────────────────────────────────
    if (status === 429) {
      const r = req.__risk || {};
      console.warn(JSON.stringify({
        evt: 'rate_limit',
        path: req.originalUrl || req.url,
        ip: r.ip || null,
        ip_subnet24: r.ip ? subnet24(r.ip) : null,
        deviceIdHash: r.deviceIdHash || null,
        emailHash: r.emailHash || null,
        uaHash: r.uaHash || null,
        domain: r.domain || null,
        reason: r.reason || 'throttle',
        ts: new Date().toISOString(),
      }));
    } else {
      // ── DEV diagnostics for non-429 ──────────────────────────────────────────
      const url = req.originalUrl || req.url;
      const method = req.method;
      const keys = Object.keys((req as any).body || {});
      const respMsg = Array.isArray(body?.message) ? body.message : body?.message;

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
    const isObj = typeof body === 'object' && body !== null;

    // Prefer a domain code from the thrown exception body; otherwise map by status
    const codeFromBody: string | undefined = isObj ? body.code : undefined;
    const defaultCode =
      status === 400 ? 'BAD_REQUEST' :
      status === 401 ? 'AUTH_UNAUTHORIZED' :
      status === 403 ? 'FORBIDDEN' :
      status === 404 ? 'NOT_FOUND' :
      status === 409 ? 'CONFLICT' :
      status === 422 ? 'UNPROCESSABLE_ENTITY' :
      status === 429 ? 'RATE_LIMITED' :
      status >= 500 ? 'INTERNAL_ERROR' :
      'HTTP_ERROR';

    const code = codeFromBody ?? defaultCode;

    // Message: join arrays, otherwise use provided message or Nest default
    const rawMsg = Array.isArray(body?.message)
      ? body.message
      : (isObj ? body?.message : undefined);

    const message =
      status === 429
        ? 'Too many requests. Try again later.'
        : (Array.isArray(rawMsg) ? rawMsg.join('; ') : (rawMsg || exception.message || 'Error'));

    // Keep the array details separately when available (useful for validation errors)
    const details = Array.isArray(body?.message) ? body.message : undefined;

    res.status(status).json({
      success: false,
      statusCode: status,
      code,
      message,
      error: status === 429 ? 'TooManyRequests' : (body?.error || exception.name),
      ...(details ? { details } : {}),
      timestamp: new Date().toISOString(),
      path: req.originalUrl || req.url,
    });
  }
}
