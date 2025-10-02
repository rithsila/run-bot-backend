// src/redis/redis.provider.ts
import { Provider } from '@nestjs/common';
import IORedis, { Redis } from 'ioredis';
import { REDIS } from './redis.constants';

export const redisProvider: Provider<Redis> = {
    provide: REDIS,
    useFactory: async (): Promise<Redis> => {
        const url = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
        const client = new IORedis(url, { lazyConnect: true });
        await client.connect();
        return client;
    },
};
