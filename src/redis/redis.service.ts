// src/redis/redis.service.ts
import { Inject, Injectable, ConflictException, OnModuleDestroy } from '@nestjs/common';
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
    return ttlSec ? this.redis.set(key, value, 'EX', ttlSec) : this.redis.set(key, value);
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
    try { await this.redis.quit(); } catch { /* ignore */ }
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
    const res = await this.redis.set(`lock:${key}`, token, 'EX', ttlSec, 'NX');
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
  async refreshLock(key: string, token: string, ttlSec: number): Promise<boolean> {
    const script = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("EXPIRE", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;
    const res = await this.redis.eval(script, 1, `lock:${key}`, token, String(ttlSec));
    return res === 1;
  }
}
