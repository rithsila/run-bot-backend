// src/signal/security/signature.guard.ts
import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { verifyHmacWithTimestamp } from 'src/common/crypto/hmac.util';
import { ReplayService } from './replay.service';

function toNum(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

@Injectable()
export class SignatureGuard implements CanActivate {
  constructor(@Optional() private readonly replay?: ReplayService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req: any = ctx.switchToHttp().getRequest();

    // You must attach rawBody in main.ts (so HMAC verifies the exact bytes)
    // e.g. app.use(json({ verify: (req:any, _res, buf) => { req.rawBody = buf } }));
    const raw: Buffer | string | undefined = req.rawBody;
    if (!raw) throw new BadRequestException('Raw body missing (enable rawBody in main.ts)');

    const h = req.headers ?? {};
    const q = req.query ?? {};
    const b = req.body ?? {};

    // -------- Path A: API Key override (no signature needed) ----------
    const providedApiKey =
      (h['x-api-key'] as string | undefined) ??
      (q.apiKey as string | undefined) ??
      (b.apiKey as string | undefined);
    const expectedApiKey = process.env.WEBHOOK_API_KEY?.trim();

    if (providedApiKey) {
      if (!expectedApiKey) {
        throw new BadRequestException('Server API key not configured');
      }
      if (providedApiKey !== expectedApiKey) {
        throw new UnauthorizedException('Invalid API key');
      }
      // Optional: very light replay guard for API-key flow (based on body.timestamp/nonce if present)
      if (this.replay) {
        const ts = toNum(b?.timestamp ?? q?.timestamp);
        const nonce = typeof b?.nonce === 'string' ? b.nonce : '';
        const replayKey = `api:${ts ?? 'no-ts'}:${(nonce ?? '').slice(0, 32)}`;
        const maxSkew = Number(process.env.SIGNATURE_MAX_SKEW || 300);
        const ok = await this.replay.checkAndStore(replayKey, maxSkew);
        if (!ok) throw new ForbiddenException('Replay detected');
      }
      return true;
    }

    // -------- Path B: HMAC signature verification ----------
    const tsInput =
      (h['x-timestamp'] as string | undefined) ??
      (q.timestamp as string | undefined) ??
      (b.timestamp as string | undefined);

    const sigInput =
      (h['x-signature'] as string | undefined) ??
      (q.signature as string | undefined) ??
      (b.signature as string | undefined) ??
      (b.sig as string | undefined);

    const keyId =
      (h['x-key-id'] as string | undefined) ??
      (q.keyId as string | undefined) ??
      (b.keyId as string | undefined) ??
      process.env.WEBHOOK_KEY_ID;

    // precise missing message
    const missing: string[] = [];
    if (!tsInput) missing.push('x-timestamp (or body.timestamp)');
    if (!sigInput) missing.push('x-signature (or body.signature)');
    if (missing.length) {
      const msg = missing.length === 2 ? `Missing ${missing[0]} and ${missing[1]}` : `Missing ${missing[0]}`;
      throw new UnauthorizedException(msg);
    }

    const tsNum = toNum(tsInput);
    const nowSec = Math.floor(Date.now() / 1000);
    const maxSkew = Number(process.env.SIGNATURE_MAX_SKEW || 300);
    if (!tsNum || Math.abs(nowSec - tsNum) > maxSkew) {
      throw new UnauthorizedException('Timestamp outside allowed window');
    }

    const secret = process.env.WEBHOOK_SECRET;
    if (!secret) throw new BadRequestException('Server secret not configured');

    const ok = verifyHmacWithTimestamp(String(sigInput), raw, tsNum, secret);
    if (!ok) throw new UnauthorizedException('Invalid signature');

    // Optional replay protection
    const nonce = typeof b?.nonce === 'string' ? b.nonce : '';
    const replayKey =
      nonce && nonce.length <= 128
        ? `mt5:${keyId ?? 'default'}:${tsNum}:${nonce}`
        : `mt5:${keyId ?? 'default'}:${tsNum}:${String(sigInput).slice(0, 16)}`;

    if (this.replay) {
      const stored = await this.replay.checkAndStore(replayKey, maxSkew);
      if (!stored) throw new UnauthorizedException('Replay detected');
    }

    return true;
  }
}
