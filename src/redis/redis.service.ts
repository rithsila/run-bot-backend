// src/redis/redis.service.ts
import {
    Inject,
    Injectable,
    ConflictException,
    OnModuleDestroy,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS } from './redis.constants';
import { randomUUID } from 'crypto';

@Injectable()
export class RedisService implements OnModuleDestroy {
    constructor(@Inject(REDIS) private readonly redis: Redis) {}

    // --- core helpers ---
    ping() {
        return this.redis.ping();
    }
    set(key: string, value: string, ttlSec?: number) {
        return ttlSec
            ? this.redis.set(key, value, 'EX', ttlSec)
            : this.redis.set(key, value);
    }
    get(key: string) {
        return this.redis.get(key);
    }
    del(key: string) {
        return this.redis.del(key);
    }
    getClient() {
        return this.redis;
    }

    // --- graceful shutdown ---
    async onModuleDestroy() {
        try {
            await this.redis.quit();
        } catch {
            /* ignore */
        }
    }

    // --- distributed lock (mutex) ---
    /**
     * Acquire a mutex at lock:<key>.
     * Returns a random token; you MUST pass it to releaseLock().
     * Throws ConflictException if already locked.
     */
    async acquireLock(key: string, ttlSec = 5): Promise<{ token: string }> {
        const token = randomUUID();
        // ioredis v5: correct order is 'EX', ttl, 'NX'
        const res = await this.redis.set(
            `lock:${key}`,
            token,
            'EX',
            ttlSec,
            'NX',
        );
        if (res !== 'OK') {
            throw new ConflictException('Another order in progress');
        }
        return { token };
    }

    /**
     * Release the mutex only if the token matches (safe compare-and-delete).
     * Returns true if a lock was released.
     */
    async releaseLock(key: string, token: string): Promise<boolean> {
        const script = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      else
        return 0
      end
    `;
        const res = await this.redis.eval(script, 1, `lock:${key}`, token);
        return res === 1;
    }

    /**
     * Optionally extend the lock (refresh TTL) if token matches.
     * Returns true if TTL was updated.
     */
    async refreshLock(
        key: string,
        token: string,
        ttlSec: number,
    ): Promise<boolean> {
        const script = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("EXPIRE", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;
        const res = await this.redis.eval(
            script,
            1,
            `lock:${key}`,
            token,
            String(ttlSec),
        );
        return res === 1;
    }

    private sigKey(pair: string) {
        return `retail:avg_signal:${pair.toUpperCase()}`; // e.g. retail:avg_signal:EURUSD
    }

    /**
     * Save only the average signal for a pair.
     * Stores as a small hash: {signal, runAt}. Optional TTL (seconds).
     * signal ∈ 'buy' | 'sell' | 'neutral' | '' | null
     */
    async setAvgSignal(params: {
        pair: string;
        signal: string | null;
        runAt?: Date;
        ttlSec?: number; // optional
    }): Promise<void> {
        const key = this.sigKey(params.pair);
        const signal = (params.signal ?? '').toLowerCase();
        const runAtIso = (params.runAt ?? new Date()).toISOString();

        await this.redis.hset(key, { signal, runAt: runAtIso });
        if (params.ttlSec && params.ttlSec > 0) {
            await this.redis.expire(key, params.ttlSec);
        }
    }

    /**
     * Read only the average signal for a pair.
     * Returns { signal, runAt } or null if missing.
     */
    async getAvgSignal(
        pair: string,
    ): Promise<{ signal: string | null; runAt: string | null } | null> {
        const key = this.sigKey(pair);
        const h = await this.redis.hgetall(key);
        if (!h || Object.keys(h).length === 0) return null;
        return {
            signal: h.signal ? String(h.signal).toLowerCase() : null,
            runAt: h.runAt ?? null,
        };
    }
}
