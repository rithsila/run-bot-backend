// src/common/http/cookies.ts
import type { CookieOptions } from 'express';

export function cookieBase(opts?: {
    sameSite?: 'strict' | 'lax' | 'none';
}): CookieOptions {
    const isProd = process.env.NODE_ENV === 'production';

    // Use host-only cookies for safety. If you ever set a Domain, you CANNOT use __Host- prefix.
    // Host-only cookie prevents other subdomains from setting/overwriting it.
    const base: CookieOptions = {
        secure: isProd, // always true in prod (required if SameSite=None)
        sameSite: opts?.sameSite ?? (isProd ? 'strict' : 'lax'),
        path: '/',
        // no domain => host-only cookie (recommended)
    };

    return base;
}
