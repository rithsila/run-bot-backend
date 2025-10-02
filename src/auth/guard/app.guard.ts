// src/auth/guard/app.guard.ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { APP_KEY, AppAudience } from '../decorators/app.decorator';

@Injectable()
export class AppGuard implements CanActivate {
    constructor(private reflector: Reflector) { }

    canActivate(ctx: ExecutionContext): boolean {
        const req = ctx.switchToHttp().getRequest();
        const requiredAud =
            this.reflector.get<AppAudience>(APP_KEY, ctx.getHandler()) ??
            this.reflector.get<AppAudience>(APP_KEY, ctx.getClass());

        if (!requiredAud) return true; // route not audience-restricted

        const user = req.user as { aud?: AppAudience } | undefined;
        return !!user && user.aud === requiredAud;
    }
}
