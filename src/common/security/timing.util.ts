// src/security/timing.util.ts
import crypto from 'node:crypto';

/**
 * Constant-time equality for secrets (avoids timing leaks).
 * Uses crypto.timingSafeEqual when possible; otherwise falls back
 * to a manual XOR pass that also hides length differences.
 */
export function constantTimeEqual(a: string, b: string): boolean {
    const A = Buffer.from(a ?? '', 'utf8');
    const B = Buffer.from(b ?? '', 'utf8');

    // If lengths differ, pad the shorter one with zeros so timing is consistent
    const len = Math.max(A.length, B.length);
    const Ap = A.length === len ? A : Buffer.concat([A, Buffer.alloc(len - A.length)]);
    const Bp = B.length === len ? B : Buffer.concat([B, Buffer.alloc(len - B.length)]);

    try {
        // timingSafeEqual throws if lengths differ; we padded above to avoid that.
        return crypto.timingSafeEqual(Ap, Bp) && A.length === B.length;
    } catch {
        // Fallback: manual constant-time compare
        let diff = A.length ^ B.length;
        for (let i = 0; i < len; i++) diff |= Ap[i] ^ Bp[i];
        return diff === 0;
    }
}
