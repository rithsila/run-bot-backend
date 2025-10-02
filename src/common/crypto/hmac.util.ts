// src/common/crypto/hmac.util.ts
import * as crypto from 'crypto';

export function verifyHmac(sigHeader: string | undefined, rawBody: string | Buffer, secret: string): boolean {
  if (!sigHeader || !secret) return false;

  // Normalize
  const provided = Buffer.from(sigHeader.trim().toLowerCase(), 'hex');
  const bodyBuf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');

  // Compute expected (lowercase hex)
  const expectedHex = crypto.createHmac('sha256', secret).update(bodyBuf).digest('hex');
  const expected = Buffer.from(expectedHex, 'hex');

  if (provided.length !== expected.length) return false;

  // Timing-safe compare
  return crypto.timingSafeEqual(provided, expected);
}
