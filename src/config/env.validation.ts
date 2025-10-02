import * as Joi from 'joi';

// TTL: "900" | "900s" | "10m" | "1h" | "30d"
const ttlPattern = /^\d+\s*[smhd]?$/i;

// Base64→PEM checker (allows empty when not required by alg)
const b64Pem = (label: string) =>
  Joi.string().custom((v, helpers) => {
    if (!v) return v; // allow empty; requirement handled by .when()
    let pem = '';
    try {
      pem = Buffer.from(String(v).trim().replace(/\s+/g, ''), 'base64').toString('utf8').trim();
    } catch {
      return helpers.error('any.invalid', { message: `${label} is not valid base64` });
    }
    const ok =
      /^-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/m.test(pem) ||
      /^-----BEGIN PUBLIC KEY-----/m.test(pem);
    if (!ok) {
      return helpers.error('any.invalid', { message: `${label} is not a base64-encoded PEM` });
    }
    return v;
  }, 'base64-PEM validator');

export const envValidationSchema = Joi.object({
  // ─── App Config ──────────────────────────────────────────────
  NODE_ENV: Joi.string().valid('development', 'test', 'staging', 'production').required(),
  PORT: Joi.number().integer().min(1).max(65535).default(4000),

  COOKIE_DOMAIN: Joi.string().allow('', null).default(null), // e.g. .bhub.local (optional)

  // ─── Database ────────────────────────────────────────────────
  MONGO_URI: Joi.string().uri().required(),

  // ─── JWT Issuer/Audience (shared) ────────────────────────────
  JWT_ISSUER: Joi.string().uri().required(),
  JWT_AUDIENCE: Joi.string().required(),

  // (Legacy single ALG for backward compat with older code)
  JWT_ALG: Joi.string().valid('RS256', 'HS256', 'EdDSA').default('RS256'),

  // ─── JWT (Access Token) ──────────────────────────────────────
  JWT_ACCESS_ALG: Joi.string().valid('RS256', 'HS256', 'EdDSA').default(Joi.ref('JWT_ALG')),
  JWT_ACCESS_TTL: Joi.string().pattern(ttlPattern).default('900s'),

  // When RS256/EdDSA, require keys; when HS256, allow empty
  JWT_ACCESS_PRIVATE_KEY_BASE64: b64Pem('JWT_ACCESS_PRIVATE_KEY_BASE64')
    .when('JWT_ACCESS_ALG', { is: 'HS256', then: Joi.string().allow('').default(''), otherwise: Joi.string().required() }),
  JWT_ACCESS_PUBLIC_KEY_BASE64: b64Pem('JWT_ACCESS_PUBLIC_KEY_BASE64')
    .when('JWT_ACCESS_ALG', { is: 'HS256', then: Joi.string().allow('').default(''), otherwise: Joi.string().required() }),


  // ─── Redis ───────────────────────────────────────────────────
  REDIS_URL: Joi.string().uri().required(),

}).unknown(true);
