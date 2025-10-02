import type { Request } from 'express';

export function getClientIp(req: Request): string | null {
    const xff = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
    return xff || (req.ip ?? (req.socket?.remoteAddress ?? null));
}