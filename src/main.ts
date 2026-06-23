// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger as PinoLogger } from 'nestjs-pino';
import { Logger, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { HttpErrorFilter } from './common/http/http-error.filter';
import * as bodyParser from 'body-parser';
import helmet from 'helmet';
import hpp from 'hpp';
import compression from 'compression';
import { buildAllowedOrigins } from './common/security/origin';
import { SocketIoAdapter } from './common/ws/socketio.adapter';
import { RequiredHeadersMiddleware } from './middleware/required-headers.middleware';

async function bootstrap() {
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
        bufferLogs: true,
    });

    app.set('trust proxy', 1);
    app.useLogger(app.get(PinoLogger));
    const logger = new Logger('Bootstrap');
    const config = app.get(ConfigService);

    // 👉 flag for environment
    const isProd = config.get('NODE_ENV') === 'production';

    // ---- build origins at RUNTIME ----
    const allowedOrigins = buildAllowedOrigins([
        config.get<string>('FRONTEND_URL'),
    ]);

    logger.log(`[CORS] allowed origins: ${allowedOrigins.join(', ')}`);

    app.enableCors({
        origin: allowedOrigins,
        credentials: true,
        methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: [
            'content-type',
            'accept',
            'authorization',
            'x-csrf-token',
            'x-device-id',
            'x-request-id',
        ],
        optionsSuccessStatus: 204,
        maxAge: 86400,
    });

    // WebSocket adapter (single instance, no Redis adapter)
    const wsAdapter = new SocketIoAdapter(app, allowedOrigins);
    app.useWebSocketAdapter(wsAdapter);

    app.useGlobalFilters(new HttpErrorFilter());

    // ---- Body parsers ----
    app.use(
        bodyParser.json({
            limit: '64kb',
            verify: (req: any, _res, buf) => {
                req.rawBody = buf;
            },
        }),
    );
    app.use(
        bodyParser.urlencoded({
            extended: false,
            limit: '16kb',
            verify: (req: any, _res, buf) => {
                req.rawBody = buf;
            },
        }),
    );

    app.use((req, res, next) => {
        const m = req.method;
        const hasBody = Number(req.headers['content-length'] || 0) > 0;

        if (
            m === 'POST' ||
            m === 'PUT' ||
            m === 'PATCH' ||
            (m === 'DELETE' && hasBody)
        ) {
            if (hasBody && (!req.is || !req.is('application/json'))) {
                return res
                    .status(415)
                    .json({ message: 'Unsupported Media Type' });
            }
        }
        next();
    });

    // Global validation
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
            transformOptions: { enableImplicitConversion: true },
            validationError: { target: false, value: false },
            disableErrorMessages: isProd,
        }),
    );

    // Security / hardening
    app.use(
        helmet({
            contentSecurityPolicy: false,
            crossOriginEmbedderPolicy: false,
        }),
    );

    app.use(hpp());
    app.use(compression({ threshold: '1kb' }));
    app.use(cookieParser());

    // ✅ Global required headers (placed AFTER parsers, BEFORE everything else)
    app.use(new RequiredHeadersMiddleware().use);

    app.disable('x-powered-by');
    app.set('etag', 'strong');

    app.enableShutdownHooks();

    const port = Number(process.env.PORT) || config.get<number>('PORT', 4000);
    await app.listen(port);
    logger.log(`🚀 Application listening on port ${port}`);
}

bootstrap();
