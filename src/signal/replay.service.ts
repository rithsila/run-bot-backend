// src/signal/security/replay.service.ts
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class ReplayService implements OnModuleDestroy {
  private readonly log = new Logger(ReplayService.name);
  private redis?: Redis;
  private mem = new Map<string, number>(); // fallback store: key -> expiresAt(ms)

  constructor() {
    const url = process.env.REDIS_URL;
    if (url && url.trim()) {
      this.redis = new Redis(url, {
        maxRetriesPerRequest: 2,
        enableReadyCheck: true,
        lazyConnect: false,
      });
      this.redis.on('error', (err) => this.log.error(`Redis error: ${err.message}`));
      this.redis.on('connect', () => this.log.log('Redis connected for ReplayService'));
    } else {
      this.log.warn('REDIS_URL not set — using in-memory replay store (dev only)');
    }
  }

  /**
   * Returns true if this (key, ttl) has NOT been seen before, and stores it.
   * - With Redis: SET key "1" NX EX ttlSeconds
   * - With memory: set if not present, auto-clean on access
   */
  async checkAndStore(key: string, ttlSeconds: number): Promise<boolean> {
    if (ttlSeconds <= 0) return true; // effectively disabled

    // --- Redis path ---
    if (this.redis) {
      const res = await this.redis.set(key, '1', 'EX', ttlSeconds, 'NX');
      return res === 'OK';
    }

    // --- In-memory fallback ---
    const now = Date.now();
    // purge expired key if present
    const exp = this.mem.get(key);
    if (exp && exp <= now) this.mem.delete(key);

    if (this.mem.has(key)) return false;
    this.mem.set(key, now + ttlSeconds * 1000);

    // Opportunistic cleanup to avoid unbounded growth
    if (this.mem.size > 5000) this.gc(now);
    return true;
  }

  /** Manual delete (not required for the guard, but handy for tests) */
  async remove(key: string): Promise<void> {
    if (this.redis) {
      await this.redis.del(key);
      return;
    }
    this.mem.delete(key);
  }

  /** Simple GC for the in-memory store */
  private gc(nowMs = Date.now()) {
    for (const [k, exp] of this.mem.entries()) {
      if (exp <= nowMs) this.mem.delete(k);
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      try {
        await this.redis.quit();
      } catch {
        await this.redis.disconnect();
      }
    }
  }
}
