// src/app.module.ts

// ─── Core NestJS & Config ──────────────────────────────────────────────────────
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

// ─── Validation & Environment ──────────────────────────────────────────────────
import { envValidationSchema } from './config/env.validation';

// ─── Database ──────────────────────────────────────────────────────────────────
import { MongooseModule } from '@nestjs/mongoose';

// ─── Security & Throttling ─────────────────────────────────────────────────────
import { ThrottlerModule, seconds } from '@nestjs/throttler';
import { ConsoleThrottlerGuard } from './common/guards/console-throttler.guard';

// ─── Logger ───────────────────────────────────────────────────────────────────
import { LoggerModule } from 'nestjs-pino';

// ─── Scheduling ────────────────────────────────────────────────────────────────
import { ScheduleModule } from '@nestjs/schedule';

// ─── Controllers ──────────────────────────────────────────────────────────────
import { AppController } from './app.controller';

// ─── Feature Modules ──────────────────────────────────────────────────────────
import { ConsoleModule } from './console/console.module';

@Module({
    imports: [
        // ─── Global Config ────────────────────────────────────────────────────────
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: [
                `.env.${process.env.NODE_ENV || 'development'}`,
                '.env',
            ],
            ignoreEnvFile: false,
            expandVariables: true,
            cache: true,
            validationSchema: envValidationSchema,
            validationOptions: {
                abortEarly: false,
                allowUnknown: true,
                stripUnknown: false,
            },
        }),

        // ─── Logging (Pino) ───────────────────────────────────────────────────────
        LoggerModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (cfg: ConfigService) => {
                const isDev = cfg.get('NODE_ENV') !== 'production';

                return {
                    pinoHttp: {
                        level:
                            cfg.get<string>('LOG_LEVEL') ??
                            (isDev ? 'debug' : 'info'),
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
                            (req.headers['x-request-id'] as string) ||
                            crypto.randomUUID(),

                        customProps: (req) => ({
                            reqId: (req as any).id,
                            userId: (req as any)?.user?.userId,
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
            useFactory: (cs: ConfigService) => ({
                uri: cs.get<string>('MONGO_URI'),
            }),
        }),

        // ─── Throttling (in-memory; no Redis) ─────────────────────────────────────
        ThrottlerModule.forRoot({
            throttlers: [{ limit: 60, ttl: seconds(60) }], // 60 req/min
        }),

        ScheduleModule.forRoot(),

        // ─── Feature Modules ──────────────────────────────────────────────────────
        ConsoleModule,
    ],

    controllers: [AppController],

    providers: [{ provide: APP_GUARD, useClass: ConsoleThrottlerGuard }],
})
export class AppModule {}
