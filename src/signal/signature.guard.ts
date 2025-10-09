// src/signal/security/signature.guard.ts
import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { verifyHmacWithTimestamp } from 'src/common/crypto/hmac.util';
import { ReplayService } from './replay.service';

function toNum(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

@Injectable()
export class SignatureGuard implements CanActivate {
  constructor(@Optional() private readonly replay?: ReplayService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req: any = ctx.switchToHttp().getRequest();

    // MUST capture raw body in main.ts (see below)
    const raw: Buffer | string | undefined = req.rawBody;
    if (!raw) throw new BadRequestException('Raw body missing (enable rawBody in main.ts)');

    const h = req.headers ?? {};
    const q = req.query ?? {};
    const b = req.body ?? {};

    // ---- Inputs (headers OR body OR query)
    const tsInput =
      (h['x-timestamp'] as string | undefined) ??
      (q.timestamp as string | undefined) ??
      (b.timestamp as string | undefined);

    const sigInput =
      (h['x-signature'] as string | undefined) ??
      (q.signature as string | undefined) ??
      (b.signature as string | undefined) ??
      (b.sig as string | undefined);

    // precise missing message
    const missing: string[] = [];
    if (!tsInput) missing.push('x-timestamp (or body.timestamp)');
    if (!sigInput) missing.push('x-signature (or body.signature)');
    if (missing.length) {
      const msg = missing.length === 2 ? `Missing ${missing[0]} and ${missing[1]}` : `Missing ${missing[0]}`;
      throw new UnauthorizedException(msg);
    }

    // ---- Timestamp skew
    const tsNum = toNum(tsInput);
    const nowSec = Math.floor(Date.now() / 1000);
    const maxSkew = Number(process.env.SIGNATURE_MAX_SKEW || 300);
    if (!tsNum || Math.abs(nowSec - tsNum) > maxSkew) {
      throw new UnauthorizedException('Timestamp outside allowed window');
    }

    // ---- Secret & HMAC verify
    const secret = process.env.WEBHOOK_SECRET;
    if (!secret) throw new BadRequestException('Server secret not configured');

    const ok = verifyHmacWithTimestamp(String(sigInput), raw, tsNum, secret);
    if (!ok) throw new UnauthorizedException('Invalid signature');

    // ---- Optional replay protection
    if (this.replay) {
      const nonce = typeof b?.nonce === 'string' ? b.nonce : '';
      const replayKey =
        nonce && nonce.length <= 128
          ? `mt5:${tsNum}:${nonce}`
          : `mt5:${tsNum}:${String(sigInput).slice(0, 16)}`;
      const stored = await this.replay.checkAndStore(replayKey, maxSkew);
      if (!stored) throw new UnauthorizedException('Replay detected');
    }

    return true;
  }
}
