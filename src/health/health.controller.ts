import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type Redis from 'ioredis';
import { REDIS } from '../redis/redis.constants';

@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  @Get('ok')
  ok() {
    return { ok: true };
  }

  @Get('redis')
  async redisHealth() {
    try {
      const pong = await this.redis.ping();
      return { ok: pong === 'PONG' };
    } catch (e: any) {
      throw new ServiceUnavailableException({ ok: false, error: e?.message || 'redis error' });
    }
  }
}
