// src/security/api-key.guard.ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { WEBHOOK_REALM } from './webhook-realm.decorator';

// If you put this elsewhere, adjust the import path:
import { constantTimeEqual } from './timing.util';

type KeyMap = Record<string, string[]>;

@Injectable()
export class ApiKeyGuard implements CanActivate {
    private readonly keyMap: KeyMap;

    constructor(
        private readonly cfg: ConfigService,
        private readonly reflector: Reflector,
    ) {
        // Expect provided by webhooks.config.ts -> registerAs('webhooks', { keyMap: {...} })
        this.keyMap = this.cfg.get<KeyMap>('webhooks.keyMap') ?? {};
    }

    canActivate(ctx: ExecutionContext): boolean {
        // Determine realm from method or controller; fallback to 'default'
        const realm =
            (this.reflector.get<string>(WEBHOOK_REALM, ctx.getHandler()) ??
                this.reflector.get<string>(WEBHOOK_REALM, ctx.getClass()) ??
                'default')
                .toLowerCase();

        const keys = this.keyMap[realm] ?? this.keyMap['default'] ?? [];
        if (keys.length === 0) {
            throw new UnauthorizedException(`No API keys configured for realm "${realm}"`);
        }

        const req = ctx.switchToHttp().getRequest();

        // Style 1: X-Api-Key: <key>
        const headerKey = (req.headers['x-api-key'] as string | undefined)?.trim();

        // Style 2: Authorization: ApiKey <key>
        const auth = (req.headers['authorization'] as string | undefined) ?? '';
        const authKey = /^ApiKey\s+/i.test(auth) ? auth.replace(/^ApiKey\s+/i, '').trim() : undefined;

        const provided = headerKey || authKey || '';
        if (!provided) throw new UnauthorizedException('Missing API key');

        const ok = keys.some((k) => constantTimeEqual(k, provided));
        if (!ok) throw new UnauthorizedException('Invalid API key');

        // Optional: expose matched realm to downstream handlers
        req.webhookRealm = realm;
        return true;
    }
}
