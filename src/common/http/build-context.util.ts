import type { Request } from 'express';
import { randomUUID } from 'crypto';
import type { CreateContext } from 'src/common/types/create-context.type';

export function buildCreateContext(req: Request, idempotencyKey: string): CreateContext {
  const xfwd = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
  const ip = xfwd || req.ip || req.socket?.remoteAddress || '';

  const requestId =
    (req.headers['x-request-id'] as string | undefined)?.trim() ||
    randomUUID();

  const deviceId =
    (req.headers['x-client-device-id'] as string | undefined)?.trim() ||
    (req.headers['x-device-id'] as string | undefined)?.trim();

  const userAgent = (req.headers['user-agent'] as string | undefined) ?? '';

  return {
    idempotencyKey,
    requestId,
    deviceId,
    ip,
    userAgent,
  };
}
