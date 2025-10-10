// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger as PinoLogger } from 'nestjs-pino';
import { Logger, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import type Redis from 'ioredis';
import { REDIS } from './redis/redis.constants';
import { HttpErrorFilter } from './common/http/http-error.filter';
import * as bodyParser from 'body-parser';
import helmet from 'helmet';
import hpp from 'hpp';
import compression from 'compression';
import { buildAllowedOrigins } from './common/security/origin';
import { SocketIoAdapter } from './real-time/socketio.adapter';

async function bootstrap() {

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });

  app.useLogger(app.get(PinoLogger));
  const logger = new Logger('Bootstrap');
  const config = app.get(ConfigService);

  // ---- build origins at RUNTIME ----
  const allowedOrigins = buildAllowedOrigins([
    config.get<string>('FRONTEND_URL'),
    config.get<string>('FRONTEND_URL_IP'),
  ]);

  logger.log(`[CORS] allowed origins: ${allowedOrigins.join(', ')}`);

  const wsAdapter = new SocketIoAdapter(app, allowedOrigins);
  await wsAdapter.connectToRedisIfNeeded();   // uses REDIS_URL if present, else no-op
  app.useWebSocketAdapter(wsAdapter);

  app.set('trust proxy', 1);
  app.useGlobalFilters(new HttpErrorFilter());

  app.use(bodyParser.json({ limit: '64kb', verify: (req: any, _res, buf) => { req.rawBody = buf; } }));
  app.use(bodyParser.urlencoded({ extended: false, limit: '16kb', verify: (req: any, _res, buf) => { req.rawBody = buf; } }));

  app.use((req, res, next) => {
    const m = req.method;
    if (m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE') {
      if (!req.is || !req.is('application/json')) return res.status(415).json({ message: 'Unsupported Media Type' });
    }
    next();
  });

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    validationError: { target: false, value: false },
  }));

  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(hpp());
  app.use(compression({ threshold: '1kb' }));
  app.use(cookieParser());

  app.disable('x-powered-by');
  app.set('etag', 'strong');

  // ---- HTTP CORS: use the ARRAY (no callback, no throws) ----
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'content-type', 'accept', 'authorization',
      'x-csrf-token', 'x-client-device-id', 'x-device-id', 'x-device-hash',
      'x-internal-signature', 'x-internal-timestamp',
      'x-idempotency-key', 'idempotency-key',
    ],
    optionsSuccessStatus: 204,
    maxAge: 86400,
  });

  app.enableShutdownHooks();

  try {
    const redis = app.get<Redis>(REDIS);
    const pong = await redis.ping();
    logger.log(`✅ Redis connected: ${pong} (URL=${process.env.REDIS_URL || 'redis://localhost:6379'})`);
  } catch (e: any) {
    logger.error(`❌ Redis connection failed: ${e?.message || e}`);
  }

  const port = Number(process.env.PORT) || config.get<number>('PORT', 4000);
  await app.listen(port);
  logger.log(`🚀 Application listening on port ${port}`);
}

bootstrap();
