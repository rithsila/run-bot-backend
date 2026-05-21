import * as Joi from 'joi';

// TTL (seconds only to match runtime Number conversion)
const ttlPattern = /^\d+$/;

// Base64→PEM checker (allows empty when not required by alg)
const b64Pem = (label: string) =>
    Joi.string().custom((v, helpers) => {
        if (!v) return v; // allow empty; requirement handled by .when()
        let pem = '';
        try {
            pem = Buffer.from(String(v).trim().replace(/\s+/g, ''), 'base64')
                .toString('utf8')
                .trim();
        } catch {
            return helpers.error('any.invalid', {
                message: `${label} is not valid base64`,
            });
        }
        const ok =
            /^-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/m.test(pem) ||
            /^-----BEGIN PUBLIC KEY-----/m.test(pem);
        if (!ok) {
            return helpers.error('any.invalid', {
                message: `${label} is not a base64-encoded PEM`,
            });
        }
        return v;
    }, 'base64-PEM validator');

// JSON string parser (keeps original value but validates syntax)
const jsonString = (label: string) =>
    Joi.string().custom((v, helpers) => {
        if (!v) return v;
        try {
            JSON.parse(v);
            return v;
        } catch {
            return helpers.error('any.invalid', {
                message: `${label} must be valid JSON`,
            });
        }
    }, 'json-string validator');

export const envValidationSchema = Joi.object({
    // ─── App Config ──────────────────────────────────────────────
    NODE_ENV: Joi.string()
        .valid('development', 'test', 'staging', 'production')
        .required(),
    PORT: Joi.number().integer().min(1).max(65535).default(4000),
    FRONTEND_URL: Joi.string().uri().required(),

    COOKIE_DOMAIN: Joi.string().allow('', null).default(null), // e.g. .bhub.local (optional)

    // ─── Database ────────────────────────────────────────────────
    MONGO_URI: Joi.string().uri().required(),

    // ─── JWT Issuer/Audience (shared) ────────────────────────────
    JWT_ISSUER: Joi.string().uri().required(),
    JWT_AUDIENCE: Joi.string().required(),

    // (Legacy single ALG for backward compat with older code)
    JWT_ALG: Joi.string().valid('RS256', 'HS256', 'EdDSA').default('RS256'),

    // ─── JWT (Access Token) ──────────────────────────────────────
    JWT_ACCESS_ALG: Joi.string()
        .valid('RS256', 'HS256', 'EdDSA')
        .default(Joi.ref('JWT_ALG')),
    JWT_ACCESS_TTL: Joi.string().pattern(ttlPattern).default('900'),

    // When RS256/EdDSA, require keys; when HS256, allow empty
    JWT_ACCESS_PRIVATE_KEY_BASE64: b64Pem('JWT_ACCESS_PRIVATE_KEY_BASE64').when(
        'JWT_ACCESS_ALG',
        {
            is: 'HS256',
            then: Joi.string().allow('').default(''),
            otherwise: Joi.string().required(),
        },
    ),
    JWT_ACCESS_PUBLIC_KEY_BASE64: b64Pem('JWT_ACCESS_PUBLIC_KEY_BASE64').when(
        'JWT_ACCESS_ALG',
        {
            is: 'HS256',
            then: Joi.string().allow('').default(''),
            otherwise: Joi.string().required(),
        },
    ),
    JWT_ACCESS_SECRET: Joi.string().when('JWT_ACCESS_ALG', {
        is: 'HS256',
        then: Joi.string().min(16).required(),
        otherwise: Joi.string().allow('').default(''),
    }),
    JWT_DEBUG_PAYLOAD: Joi.string().valid('0', '1').default('0'),

    // Password reset link TTL (minutes)
    PW_RESET_TTL_MIN: Joi.number().integer().min(1).default(20),

    // ─── Redis ───────────────────────────────────────────────────
    REDIS_URL: Joi.string().uri().required(),

    // ─── Mail / SMTP ─────────────────────────────────────────────
    MAIL_FROM_NAME: Joi.string().default('No-Reply'),
    MAIL_FROM_EMAIL: Joi.string().email().required(),
    GMAIL_APP_PASSWORD: Joi.string().min(16).required(),

    // ─── Google OAuth ────────────────────────────────────────────
    GOOGLE_CLIENT_ID: Joi.string().required(),
    GOOGLE_CLIENT_SECRET: Joi.string().required(),
    GOOGLE_CALLBACK_URL: Joi.string().uri().required(),

    // ─── AWS / S3 ────────────────────────────────────────────────
    AWS_ACCESS_KEY_ID: Joi.string().min(16).required(),
    AWS_SECRET_ACCESS_KEY: Joi.string().min(32).required(),
    AWS_REGION: Joi.string().default('ap-southeast-2'),
    S3_BUCKET_NAME: Joi.string().required(),

    // ─── Internal signing / webhooks ─────────────────────────────
    INTERNAL_HMAC_SECRET: Joi.string().min(16).required(),

    // ─── Web Push (VAPID) ────────────────────────────────────────
    PUSH_VAPID_PUBLIC_KEY: Joi.string().required(),
    PUSH_VAPID_PRIVATE_KEY: Joi.string().required(),
    PUSH_VAPID_SUBJECT: Joi.string().required(),

    // ─── Turnstile ───────────────────────────────────────────────
    // Cloudflare publishes test secrets matching /^[13]x0+AA$/ that
    // always pass siteverify. They are fine for local/UAT but MUST NOT
    // ship to production — refuse to boot if NODE_ENV=production while
    // CF_TURNSTILE_SECRET still looks like a test key.
    CF_TURNSTILE_SECRET: Joi.string()
        .required()
        .when('NODE_ENV', {
            is: 'production',
            then: Joi.string()
                .pattern(/^[13]x0+AA$/, { invert: true })
                .messages({
                    'string.pattern.invert.base':
                        'CF_TURNSTILE_SECRET looks like a Cloudflare test key. Configure a real secret before running NODE_ENV=production.',
                }),
        }),

    // ─── External issuer signing (EA) ────────────────────────────
    ISSUER: Joi.string().uri().required(),
    TOKEN_TTL_DAYS: Joi.number().integer().min(1).default(30),
    SIGNING_KID: Joi.string().required(),
    SIGNING_PRIVATE_JWK: jsonString('SIGNING_PRIVATE_JWK').required(),
    PUBLIC_JWKS: jsonString('PUBLIC_JWKS').allow('', null).default(null),

    // ─── API keys ────────────────────────────────────────────────
    API_KEY: Joi.string().required(),
}).unknown(true);
