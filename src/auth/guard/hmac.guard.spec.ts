import { InternalHmacGuard } from './hmac.guard';

describe('InternalHmacGuard constructor (H-2)', () => {
    const ORIGINAL = process.env.INTERNAL_HMAC_SECRET;

    afterEach(() => {
        if (ORIGINAL === undefined) {
            delete process.env.INTERNAL_HMAC_SECRET;
        } else {
            process.env.INTERNAL_HMAC_SECRET = ORIGINAL;
        }
    });

    it('throws when INTERNAL_HMAC_SECRET is undefined', () => {
        delete process.env.INTERNAL_HMAC_SECRET;
        expect(() => new InternalHmacGuard()).toThrow(
            /INTERNAL_HMAC_SECRET is not set/,
        );
    });

    it('throws when INTERNAL_HMAC_SECRET is empty string', () => {
        process.env.INTERNAL_HMAC_SECRET = '';
        expect(() => new InternalHmacGuard()).toThrow(
            /INTERNAL_HMAC_SECRET is not set/,
        );
    });

    it('constructs successfully when secret is present', () => {
        process.env.INTERNAL_HMAC_SECRET = 'unit-test-secret-please-rotate';
        expect(() => new InternalHmacGuard()).not.toThrow();
    });
});
