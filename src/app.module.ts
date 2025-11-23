// src/app.module.ts

// ─── Core NestJS & Config ──────────────────────────────────────────────────────
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import type { Request } from 'express';

// ─── Validation & Environment ──────────────────────────────────────────────────
import { envValidationSchema } from './config/env.validation';
import { resolveExistingEnvFiles } from './config/env-files';

// ─── Database & Redis ─────────────────────────────────────────────────────────
import { MongooseModule } from '@nestjs/mongoose';
import type Redis from 'ioredis';
import { REDIS } from './redis/redis.constants';
import { RedisModule } from './redis/redis.module';

// ─── Security & Throttling ─────────────────────────────────────────────────────
import { ThrottlerModule, ThrottlerGuard, seconds } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { sha256Hex } from './common/crypto/hash.util';

// ─── Logger ───────────────────────────────────────────────────────────────────
import { LoggerModule } from 'nestjs-pino';

// ─── Controllers & Services ───────────────────────────────────────────────────
import { AppController } from './app.controller';

// ─── Feature Modules ──────────────────────────────────────────────────────────
import { UserModule } from './user/user.module';
import { MailModule } from './mail/mail.module';
import { AuthModule } from './auth/auth.module';

// ─── Middleware ───────────────────────────────────────────────────────────────
import { JwtAuthGuard } from './auth/guard/jwt-auth.guard';
import { CsrfGuard } from './auth/guard/csrf.guard';
import { MediaModule } from './media/media.module';
import { PlanModule } from './plan/plan.module';
import { TradingPlanModule } from './trading-plan/trading-plan.module';
import { WebPushSubModule } from './web-push-sub/web-push-sub.module';
import { TurnstileModule } from './turnstile/turnstile.module';
import { AnalyzeNewsModule } from './analyze-news/analyze-news.module';
import { RealtimeModule } from './real-time/real-time.module';
import { MembershipsModule } from './memberships/memberships.module';
import { CouponsModule } from './coupons/coupons.module';
import { QueueModule } from './queue/queue.module';
import { RolesGuard } from './auth/guard/roles.guard';
import { RetailerModule } from './retailer/retailer.module';
import { ScheduleModule } from '@nestjs/schedule';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { OrderModule } from './order/order.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';

@Module({
  imports: [
    // ─── Global Config ────────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolveExistingEnvFiles(),
      ignoreEnvFile: process.env.NODE_ENV === 'production',
      expandVariables: true,
      cache: true,
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false, allowUnknown: true, stripUnknown: false },
    }),

    // ─── Logging (Pino) ───────────────────────────────────────────────────────
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const isDev = cfg.get('NODE_ENV') !== 'production';

        return {
          pinoHttp: {
            level: cfg.get<string>('LOG_LEVEL') ?? (isDev ? 'debug' : 'info'),
            transport: isDev
              ? {
                target: 'pino-pretty',
                options: {
                  singleLine: true,
                  translateTime: 'SYS:standard',
                  messageKey: 'msg',
                },
              }
              : undefined,

            genReqId: (req) =>
              (req.headers['x-request-id'] as string) || crypto.randomUUID(),

            customProps: (req) => ({
              reqId: (req as any).id,
              userId: (req as any)?.user?.id,
            }),

            autoLogging: {
              ignore: (req) =>
                req.url === '/health' ||
                req.url?.startsWith('/_next') ||
                req.method === 'OPTIONS',
            },

            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.body.password',
                'req.body.*.password',
              ],
              censor: '[REDACTED]',
            },
          },
        };
      },
    }),

    // ─── Database (MongoDB) ───────────────────────────────────────────────────
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (cs: ConfigService) => ({
        uri: cs.get<string>('MONGO_URI'),
      }),
    }),

    // ─── Redis & Throttling ───────────────────────────────────────────────────
    RedisModule,
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [REDIS],
      useFactory: (redis: Redis) => ({
        throttlers: [{ limit: 10, ttl: seconds(60) }], // 10 req/min
        storage: new ThrottlerStorageRedisService(redis),

        common: {
          getTracker: async (req: Request) => {
            const rawDev =
              (req.headers['x-device-id'] as string | undefined) ??
              (req as any).cookies?.device_id ??
              '';

            const devHash =
              rawDev && rawDev.length >= 8 && rawDev.length <= 128
                ? sha256Hex(rawDev)
                : 'no-dev';

            const ip = req.ip || req.socket.remoteAddress || 'unknown';
            return `${ip}|${devHash}`;
          },
        },
      }),
    }),
    ScheduleModule.forRoot(),
    // ─── Feature Modules ──────────────────────────────────────────────────────
    UserModule,
    MailModule,
    AuthModule,
    MediaModule,
    PlanModule,
    TradingPlanModule,
    WebPushSubModule,
    TurnstileModule,
    AnalyzeNewsModule,
    RealtimeModule,
    MembershipsModule,
    CouponsModule,
    QueueModule,
    RetailerModule,
    MarketplaceModule,
    OrderModule,
    SubscriptionsModule,
  ],

  controllers: [AppController],

  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
export class AppModule { }
