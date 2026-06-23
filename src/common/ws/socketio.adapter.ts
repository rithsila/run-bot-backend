import { IoAdapter } from '@nestjs/platform-socket.io';
import type { INestApplicationContext } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import type { ServerOptions } from 'socket.io';

/**
 * Single-instance Socket.IO adapter (no Redis adapter).
 *
 * The slimmed bhub-api runs one process, so the previous `@socket.io/redis-adapter`
 * fan-out is gone. This adapter only applies the CORS allowlist for the `/console`
 * namespace.
 */
export class SocketIoAdapter extends IoAdapter {
    private readonly logger = new Logger(SocketIoAdapter.name);

    constructor(
        app: INestApplicationContext,
        private readonly allowedOrigins: string[],
    ) {
        super(app);
    }

    override createIOServer(port: number, options?: ServerOptions) {
        return super.createIOServer(port, {
            ...options,
            cors: {
                origin: this.allowedOrigins,
                credentials: true,
                methods: ['GET', 'POST', 'OPTIONS'],
                allowedHeaders: [
                    'content-type',
                    'accept',
                    'authorization',
                    'x-csrf-token',
                    'x-device-id',
                    'x-request-id',
                ],
            },
            transports: ['websocket', 'polling'],
            allowRequest: (req, fn) => {
                const origin = (req.headers.origin as string | undefined) ?? '';
                // Allow non-browser clients (the Go bridge) that send no Origin.
                const ok = origin ? this.allowedOrigins.includes(origin) : true;
                if (!ok) {
                    this.logger.warn(`WS blocked origin=${origin || 'none'}`);
                    return fn('Origin not allowed', false);
                }
                return fn(null, true);
            },
        });
    }
}
