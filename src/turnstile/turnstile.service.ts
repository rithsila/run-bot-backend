// src/security/turnstile.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';

type VerifyResp = {
    success: boolean;
    challenge_ts?: string;
    hostname?: string;
    action?: string;
    cdata?: string;
    ['error-codes']?: string[];
};

@Injectable()
export class TurnstileService {
    private readonly url =
        'https://challenges.cloudflare.com/turnstile/v0/siteverify';

    async verify(token: string, remoteip?: string, expectedAction?: string) {
        const secret = process.env.CF_TURNSTILE_SECRET!;
        const form = new URLSearchParams({ secret, response: token });
        if (remoteip) form.append('remoteip', remoteip);

        const r = await fetch(this.url, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: form,
        });
        const data = (await r.json()) as VerifyResp;

        if (
            !data.success ||
            (expectedAction && data.action !== expectedAction)
        ) {
            throw new BadRequestException({
                message: 'Turnstile verification failed',
                codes: data['error-codes'] ?? [],
            });
        }
        return data;
    }
}
