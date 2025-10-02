import type { CookieOptions } from "express";

export function cookieBase(): CookieOptions {
  const isProd = process.env.NODE_ENV === "production";

  // leave undefined for host-only unless you truly need a shared cookie
  const domain = process.env.COOKIE_DOMAIN || undefined;

  return {
    sameSite: isProd ? "none" : "lax", // ✅ must be 'none' in prod for OAuth
    secure: isProd,                    // ✅ required with SameSite=None
    httpOnly: true,                    // you override to false for XSRF cookie where needed
    path: "/",
    ...(domain ? { domain } : {}),
  };
}
