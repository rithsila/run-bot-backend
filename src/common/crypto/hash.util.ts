// src/common/crypto/hash.util.ts
import { createHash } from 'crypto';
export const sha256Hex = (s: string) =>
    createHash('sha256').update(s, 'utf8').digest('hex');
