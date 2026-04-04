// src/queue/queue.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import type { Redis } from 'ioredis';

import { REDIS } from '../redis/redis.constants'; // <-- your existing token
import { WebPushSubService } from 'src/web-push-sub/web-push-sub.service';
import { PushProducer } from './push.producer';
import { PushWorker } from './push.worker';
import { MongooseModule } from '@nestjs/mongoose';
import {
    WebPushSub,
    WebPushSubSchema,
} from 'src/web-push-sub/web-push-sub.schema';
import { User, UserSchema } from 'src/user/user.schema';

const enableQueue = process.env.NODE_ENV !== 'development';
type RedisWithOptions = Redis & { options: Redis['options'] };

@Module({
    imports: [
        ...(enableQueue
            ? [
                  // Reuse your existing Redis config to create BullMQ's own connections.
                  BullModule.forRootAsync({
                      inject: [REDIS],
                      useFactory: (redis: Redis) => {
                          const opts = {
                              ...(redis as RedisWithOptions).options,
                          };
                          opts.maxRetriesPerRequest = null;

                          return {
                              connection: opts,
                              prefix: 'bull',
                          };
                      },
                  }),
                  BullModule.registerQueue({
                      name: 'push',
                      defaultJobOptions: {
                          attempts: 8,
                          backoff: { type: 'exponential', delay: 2000 },
                          removeOnComplete: 1000,
                          removeOnFail: false,
                      },
                  }),
              ]
            : []),
        MongooseModule.forFeature([
            { name: WebPushSub.name, schema: WebPushSubSchema },
            { name: User.name, schema: UserSchema },
        ]),
    ],
    providers: [
        PushProducer,
        ...(enableQueue ? [PushWorker] : []),
        WebPushSubService,
    ],
    exports: [PushProducer],
})
export class QueueModule {}
