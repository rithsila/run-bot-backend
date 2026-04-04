import type { CookieOptions } from 'express';

export function cookieBase(): CookieOptions {
    const isProd = process.env.NODE_ENV === 'production';

    // leave undefined for host-only unless you truly need a shared cookie
    const domain = process.env.COOKIE_DOMAIN || undefined;

    return {
        sameSite: isProd ? 'none' : 'lax',
        secure: isProd,
        httpOnly: true,
        path: '/',
        ...(domain ? { domain } : {}),
    };
}
