// src/auth/guard/roles.guard.ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from 'src/user/user.enum';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const handler = context.getHandler();
    const clazz = context.getClass();

    // 1) Public endpoints bypass
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      handler,
      clazz,
    ]);
    if (isPublic) return true;

    // 2) Read required roles from @Roles()
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      handler,
      clazz,
    ]);

    // 3) Request & user extraction
    const req = context.switchToHttp().getRequest();
    const user = req?.user as
      | { userId?: string; email?: string; role?: Role }
      | undefined;

    // For logging context
    const meta = {
      method: req?.method,
      path: req?.originalUrl ?? req?.url,
      userId: user?.userId ?? null,
      email: user?.email ?? null,
      userRole: user?.role ?? null,
      requiredRoles: required ?? [],
    };

    // 4) If no roles specified, allow any authenticated user
    if (!required || required.length === 0) {
      // Debug-level log to avoid noisy prod logs
      this.logger.debug(
        `Allow (no @Roles).`,
        JSON.stringify(meta),
      );
      return true;
    }

    // 5) Check single-role authorization (user.role must be one of required)
    const allowed = !!user?.role && required.includes(user.role);

    // 6) Log outcome
    if (allowed) {
      this.logger.debug(
        `Allow (role matched).`,
        JSON.stringify(meta),
      );
      return true;
    }

    this.logger.warn(
      `Deny (role mismatch).`,
      JSON.stringify(meta),
    );

    // 7) Friendly 403 body picked up by your HttpErrorFilter
    throw new ForbiddenException({
      code: 'ROLE_FORBIDDEN',
      message: `Access denied. This action requires one of: ${required.join(', ')}.`,
      requiredRoles: required,
      userRole: user?.role ?? null,
    });
  }
}
