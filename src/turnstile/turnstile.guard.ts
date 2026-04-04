// src/turnstile/turnstile.guard.ts
import {
    Injectable,
    CanActivate,
    ExecutionContext,
    BadRequestException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TURNSTILE_ACTION } from './turnstile.decorator';
import { TurnstileService } from './turnstile.service';

@Injectable()
export class TurnstileGuard implements CanActivate {
    constructor(
        private readonly turnstile: TurnstileService,
        private readonly reflector: Reflector,
    ) {}

    async canActivate(ctx: ExecutionContext) {
        const req = ctx.switchToHttp().getRequest();

        const token =
            req.body?.['cf-turnstile-response']?.toString() ??
            req.body?.turnstileToken?.toString();

        if (!token) throw new BadRequestException('Missing Turnstile token');

        const expectedAction =
            this.reflector.get<string>(TURNSTILE_ACTION, ctx.getHandler()) ??
            this.reflector.get<string>(TURNSTILE_ACTION, ctx.getClass());

        const ip =
            req.headers['cf-connecting-ip'] ||
            req.headers['x-forwarded-for'] ||
            req.ip;

        await this.turnstile.verify(token, String(ip || ''), expectedAction);
        return true;
    }
}
