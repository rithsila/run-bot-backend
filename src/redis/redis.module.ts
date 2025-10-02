import { Global, Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisService } from './redis.service';
import { REDIS } from './redis.constants';
import { redisProvider } from './redis.provider';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('REDIS_URL', 'redis://localhost:6379');
        const client = new Redis(url, {
          maxRetriesPerRequest: null,
          enableReadyCheck: true,
          lazyConnect: false,
          retryStrategy: (times) => Math.min(1000 * times, 30_000),
        });

        const logger = new Logger('Redis');
        client.on('connect', () => logger.log(`connected (URL=${url})`));
        client.on('ready', () => logger.log('ready'));
        client.on('reconnecting', () => logger.warn('reconnecting…'));
        client.on('error', (e) => logger.error(`connection error: ${e?.message || e}`));

        return client;
      },
    },
    RedisService,
    redisProvider
  ],
  exports: [REDIS, RedisService],
})
export class RedisModule { }
