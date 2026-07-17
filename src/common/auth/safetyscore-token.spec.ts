import { generateKeyPair, SignJWT, exportSPKI, decodeJwt } from 'jose';

import {
    verifySafetyScoreToken,
    extractBearerToken,
    resetSafetyScoreKeyCache,
    SAFETYSCORE_TOKEN_AUDIENCE,
} from './safetyscore-token';

const CLAIMS = {
    user_id: 'user-123',
    agent_id: '184006910-XAUUSDc-1001-1002',
    license_key: 'EA-XYZ',
    account_login: '184006910',
    symbol: 'XAUUSDc',
};

describe('verifySafetyScoreToken', () => {
    let privateKey: CryptoKey;
    let wrongPrivateKey: CryptoKey;

    async function sign(
        key: CryptoKey,
        opts: { aud?: string; expSeconds?: number } = {},
    ): Promise<string> {
        const now = Math.floor(Date.now() / 1000);
        return new SignJWT(CLAIMS)
            .setProtectedHeader({ alg: 'ES256' })
            .setIssuedAt(now)
            .setExpirationTime(now + (opts.expSeconds ?? 3600))
            .setAudience(opts.aud ?? SAFETYSCORE_TOKEN_AUDIENCE)
            .sign(key);
    }

    beforeAll(async () => {
        const pair = await generateKeyPair('ES256', { extractable: true });
        privateKey = pair.privateKey;
        process.env.SAFETYSCORE_TOKEN_PUBLIC_KEY = await exportSPKI(
            pair.publicKey,
        );
        const wrong = await generateKeyPair('ES256', { extractable: true });
        wrongPrivateKey = wrong.privateKey;
    });

    beforeEach(() => resetSafetyScoreKeyCache());

    it('accepts a valid token and normalizes claims', async () => {
        const token = await sign(privateKey);
        const user = await verifySafetyScoreToken(token);
        expect(user).toEqual({
            userId: 'user-123',
            agentId: '184006910-XAUUSDc-1001-1002',
            licenseKey: 'EA-XYZ',
            accountLogin: '184006910',
            symbol: 'XAUUSDc',
            expiresAt: expect.any(Number) as number,
        });
    });

    it('returns expiresAt equal to the token exp claim', async () => {
        const token = await sign(privateKey);
        const { exp } = decodeJwt(token);
        const user = await verifySafetyScoreToken(token);
        expect(user.expiresAt).toBe(exp);
    });

    it('rejects a token signed by a different key (bad signature)', async () => {
        const token = await sign(wrongPrivateKey);
        await expect(verifySafetyScoreToken(token)).rejects.toThrow();
    });

    it('rejects an expired token', async () => {
        const token = await sign(privateKey, { expSeconds: -10 });
        await expect(verifySafetyScoreToken(token)).rejects.toThrow();
    });

    it('rejects a token with the wrong audience', async () => {
        const token = await sign(privateKey, { aud: 'some-other-aud' });
        await expect(verifySafetyScoreToken(token)).rejects.toThrow();
    });
});

describe('extractBearerToken', () => {
    it('extracts a bearer token', () => {
        expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    });

    it('is case-insensitive on the scheme', () => {
        expect(extractBearerToken('bearer xyz')).toBe('xyz');
    });

    it('returns null for missing or malformed headers', () => {
        expect(extractBearerToken(undefined)).toBeNull();
        expect(extractBearerToken('Basic abc')).toBeNull();
        expect(extractBearerToken('Bearer')).toBeNull();
    });
});
