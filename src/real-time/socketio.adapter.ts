import { IoAdapter } from '@nestjs/platform-socket.io';
import type { INestApplicationContext, LoggerService } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import type { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Redis } from 'ioredis';
import IORedis from 'ioredis';

export class SocketIoAdapter extends IoAdapter {
    private readonly logger: LoggerService;
    private pubClient: Redis | null = null;
    private subClient: Redis | null = null;

    constructor(
        app: INestApplicationContext,
        private readonly allowedOrigins: string[],
    ) {
        super(app);
        this.logger = new Logger(SocketIoAdapter.name);
    }

    async connectToRedisIfNeeded() {
        if (this.pubClient && this.subClient) return;

        const url = process.env.REDIS_URL;
        if (!url) {
            this.logger.warn('Running WITHOUT Redis adapter (single instance only)');
            return;
        }

        this.pubClient = new IORedis(url);
        this.subClient = new IORedis(url);

        await Promise.all([
            this.pubClient.status === 'ready'
                ? Promise.resolve()
                : new Promise((r) => this.pubClient!.once('ready', r)),
            this.subClient.status === 'ready'
                ? Promise.resolve()
                : new Promise((r) => this.subClient!.once('ready', r)),
        ]);

        this.logger.log(`Socket.IO Redis adapter connected (${url})`);
    }

    override createIOServer(port: number, options?: ServerOptions) {
        const server = super.createIOServer(port, {
            ...options,
            cors: {
                origin: this.allowedOrigins,
                credentials: true,
                methods: ['GET', 'POST', 'OPTIONS'],
                allowedHeaders: [
                    'content-type', 'accept', 'authorization',
                    'x-csrf-token', 'x-client-device-id', 'x-device-id', 'x-device-hash',
                    'x-internal-signature', 'x-internal-timestamp',
                    'x-idempotency-key', 'idempotency-key',
                ],
            },
            transports: ['websocket', 'polling'],
            allowRequest: (req, fn) => {
                const origin = (req.headers.origin as string | undefined) ?? '';
                // Option A (safer, but allows non-browser clients): allow when Origin is missing
                const allowWhenNoOrigin = true;

                const ok =
                    origin
                        ? this.allowedOrigins.includes(origin)
                        : allowWhenNoOrigin;

                if (!ok) {
                    this.logger.warn(`WS blocked origin=${origin || 'none'}`);
                    // IMPORTANT: pass a STRING to engine.io, not an Error object
                    return fn('Origin not allowed', false);
                }
                return fn(null, true);
            },
        });

        if (this.pubClient && this.subClient) {
            // @ts-ignore
            server.adapter(createAdapter(this.pubClient, this.subClient));
            this.logger.log('Socket.IO Redis adapter enabled');
        }

        return server;
    }
}
