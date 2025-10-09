// src/signal/security/signature.guard.ts
import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Optional,
} from '@nestjs/common';
import { verifyHmacWithTimestamp } from 'src/common/crypto/hmac.util';
import { ReplayService } from './replay.service';

@Injectable()
export class SignatureGuard implements CanActivate {
  constructor(@Optional() private readonly replay?: ReplayService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req: any = ctx.switchToHttp().getRequest();
    const raw: Buffer | string | undefined = req.rawBody;
    if (!raw) throw new BadRequestException('Raw body missing (enable rawBody in main.ts)');

    const tsHeader = req.headers['x-timestamp'] as string | undefined;
    const sigHeader = req.headers['x-signature'] as string | undefined;
    const keyId = (req.headers['x-key-id'] as string | undefined) || process.env.WEBHOOK_KEY_ID;

    // ✅ Precise "missing header(s)" messaging
    const missing: string[] = [];
    if (!tsHeader) missing.push('x-timestamp');
    if (!sigHeader) missing.push('x-signature');
    if (missing.length) {
      const msg =
        missing.length === 2 ? `Missing ${missing[0]} and ${missing[1]}` : `Missing ${missing[0]}`;
      throw new UnauthorizedException(msg);
    }

    const tsNum = Number(tsHeader);
    const nowSec = Math.floor(Date.now() / 1000);
    const maxSkew = Number(process.env.SIGNATURE_MAX_SKEW || 300);
    if (!Number.isFinite(tsNum) || Math.abs(nowSec - tsNum) > maxSkew) {
      throw new UnauthorizedException('Timestamp outside allowed window');
    }

    const secret = process.env.WEBHOOK_SECRET;
    if (!secret) throw new BadRequestException('Server secret not configured');

    const ok = verifyHmacWithTimestamp(sigHeader!, raw, tsNum, secret);
    if (!ok) throw new UnauthorizedException('Invalid signature');

    // Optional replay block
    const nonce = (req.body?.nonce as string) || '';
    const replayKey =
      nonce && nonce.length <= 128
        ? `mt5:${keyId ?? 'default'}:${tsNum}:${nonce}`
        : `mt5:${keyId ?? 'default'}:${tsNum}:${String(sigHeader).slice(0, 16)}`;

    if (this.replay) {
      const stored = await this.replay.checkAndStore(replayKey, maxSkew);
      if (!stored) throw new UnauthorizedException('Replay detected');
    }

    return true;
  }
}
