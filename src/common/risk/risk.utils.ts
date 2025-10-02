// src/common/risk/risk.utils.ts
import { createHash } from 'crypto';
import type { Request } from 'express';

export const h16 = (s?: string | null) =>
  !s ? null : createHash('sha256').update(s).digest('hex').slice(0, 16);

export function clientIp(req: Request): string {
  const xff = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim();
  return xff || (req.socket.remoteAddress || '');
}

export function subnet24(ip: string): string {
  // very simple IPv4 /24; expand if you need IPv6 /64
  const parts = ip.split('.');
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.0/24` : ip;
}

export function domainOf(email?: string | null): string | null {
  if (!email) return null;
  const p = email.toLowerCase().trim().split('@')[1];
  return p || null;
}
