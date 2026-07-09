import { importSPKI, jwtVerify, type JWTPayload } from 'jose';

type VerifyKey = Awaited<ReturnType<typeof importSPKI>>;

/**
 * Claims minted by SafetyScore (the external signing authority). run-bot-api only
 * VERIFIES these tokens; it never signs them and keeps no user accounts.
 */
export interface SafetyScoreClaims extends JWTPayload {
    user_id: string;
    agent_id?: string;
    license_key?: string;
    account_login?: string;
    symbol?: string;
}

/** Shape attached to `request.user` / socket data after a successful verify. */
export interface SafetyScoreUser {
    userId: string;
    agentId: string | null;
    licenseKey: string | null;
    accountLogin: string | null;
    symbol: string | null;
}

export const SAFETYSCORE_TOKEN_AUDIENCE = 'ea-console';

/**
 * Resolve the ES256 public key from `SAFETYSCORE_TOKEN_PUBLIC_KEY`.
 * Accepts either a raw PEM (`-----BEGIN PUBLIC KEY-----`) or a base64-encoded PEM.
 */
let cachedKey: Promise<VerifyKey> | null = null;

export function resetSafetyScoreKeyCache(): void {
    cachedKey = null;
}

function readPublicKeyPem(): string {
    const raw = process.env.SAFETYSCORE_TOKEN_PUBLIC_KEY;
    if (!raw || raw.trim().length === 0) {
        throw new Error('Missing env SAFETYSCORE_TOKEN_PUBLIC_KEY');
    }
    const trimmed = raw.trim();
    if (trimmed.startsWith('-----BEGIN')) return trimmed;
    // Treat as base64-encoded PEM.
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8').trim();
    if (!decoded.startsWith('-----BEGIN')) {
        throw new Error(
            'SAFETYSCORE_TOKEN_PUBLIC_KEY is not a PEM nor a base64-encoded PEM',
        );
    }
    return decoded;
}

function getPublicKey(): Promise<VerifyKey> {
    if (!cachedKey) {
        cachedKey = importSPKI(readPublicKeyPem(), 'ES256');
    }
    return cachedKey;
}

/**
 * Verify a SafetyScore ES256 token. Throws on bad signature, expiry, or wrong
 * audience. Returns the normalized user on success.
 */
export async function verifySafetyScoreToken(
    token: string,
): Promise<SafetyScoreUser> {
    const key = await getPublicKey();
    const { payload } = await jwtVerify(token, key, {
        algorithms: ['ES256'],
        audience: SAFETYSCORE_TOKEN_AUDIENCE,
    });
    const claims = payload as SafetyScoreClaims;
    if (!claims.user_id) {
        throw new Error('SafetyScore token missing user_id claim');
    }
    return {
        userId: claims.user_id,
        agentId: claims.agent_id ?? null,
        licenseKey: claims.license_key ?? null,
        accountLogin: claims.account_login ?? null,
        symbol: claims.symbol ?? null,
    };
}

/** Extract a bearer token from an Authorization header value. */
export function extractBearerToken(
    authHeader: string | undefined,
): string | null {
    if (!authHeader) return null;
    const [scheme, value] = authHeader.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !value) return null;
    return value.trim();
}
