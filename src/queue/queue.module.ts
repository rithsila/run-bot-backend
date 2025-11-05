// src/queue/queue.module.ts
import { Module, Inject } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import type { Redis } from 'ioredis';

import { REDIS } from '../redis/redis.constants';          // <-- your existing token
import { WebPushSubService } from 'src/web-push-sub/web-push-sub.service';
import { PushProducer } from './push.producer';
import { PushWorker } from './push.worker';
import { MongooseModule } from '@nestjs/mongoose';
import { WebPushSub, WebPushSubSchema } from 'src/web-push-sub/web-push-sub.schema';

@Module({
  imports: [
    // Reuse your existing Redis config to create BullMQ's own connections.
    // This avoids socket contention and lets BullMQ manage pub/sub + blocking clients.
    BullModule.forRootAsync({
      inject: [REDIS],
      useFactory: (redis: Redis) => {
        // Clone the ioredis options so BullMQ can open its own connections.
        // (Passing the instance directly is possible but not recommended in production.)
        const opts = { ...(redis as any).options } as Redis['options'];

        // Ensure BullMQ-friendly defaults (won't affect your existing client).
        (opts as any).maxRetriesPerRequest = null;

        return {
          // BullMQ connection options (ioredis-compatible)
          connection: opts,
          // Optional: set a Redis key prefix just for BullMQ
          prefix: 'bull',
          // You can add more global BullMQ options here if needed
        };
      },
    }),

    // Register your queue(s)
    BullModule.registerQueue({
      name: 'push',
      // Default job options applied if not overridden per job
      defaultJobOptions: {
        attempts: 8,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 1000,
        removeOnFail: false,
      },
    }),
    MongooseModule.forFeature([
      { name: WebPushSub.name, schema: WebPushSubSchema },
      // { name: User.name, schema: UserSchema }
    ]),
  ],
  providers: [
    PushProducer,
    PushWorker,
    WebPushSubService,
  ],
  exports: [PushProducer],
})
export class QueueModule { }
