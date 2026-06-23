import * as Joi from 'joi';

/**
 * Env schema for the slimmed bhub-api (console telemetry/command feature only).
 *
 * The app keeps no user accounts and no license logic. It trusts ES256 tokens
 * signed by SafetyScore and verifies them with `SAFETYSCORE_TOKEN_PUBLIC_KEY`.
 * Only Mongo is required at runtime (no Redis, no BullMQ).
 */
export const envValidationSchema = Joi.object({
    // ─── App Config ──────────────────────────────────────────────
    NODE_ENV: Joi.string()
        .valid('development', 'test', 'staging', 'production')
        .required(),
    PORT: Joi.number().integer().min(1).max(65535).default(4000),
    FRONTEND_URL: Joi.string().uri().required(),

    // ─── Database ────────────────────────────────────────────────
    MONGO_URI: Joi.string().uri().required(),

    // ─── SafetyScore token verification (ES256 public key) ───────
    // Accepts a raw PEM (-----BEGIN PUBLIC KEY-----) or a base64-encoded PEM.
    SAFETYSCORE_TOKEN_PUBLIC_KEY: Joi.string().required(),
}).unknown(true);
