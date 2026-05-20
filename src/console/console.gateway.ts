import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    MessageBody,
    ConnectedSocket,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, Inject } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { fromB64Env } from 'src/common/utils/env.util';
import { Model } from 'mongoose';
import type { Redis } from 'ioredis';

import { REDIS } from '../redis/redis.constants';
import { JoseService } from '../memberships/jose.service';
import { EaInstance, EaInstanceDocument } from './schemas/ea-instance.schema';
import { TelemetryDto } from './dto/telemetry.dto';

const TELEMETRY_TTL_SECONDS = 60;

interface BridgeSocketData {
    userId: string | null;
    isBridge: boolean;
    agentId?: string;
    licenseKey: string | null;
    accountLogin: string | null;
}

type BridgeSocket = Omit<Socket, 'data'> & { data: BridgeSocketData };

@WebSocketGateway({ namespace: '/console' })
export class ConsoleGateway
    implements OnGatewayConnection, OnGatewayDisconnect
{
    @WebSocketServer() io!: Server;
    private readonly logger = new Logger(ConsoleGateway.name);

    // commandId → socketId of the browser client waiting for ACK
    private readonly pendingAck = new Map<string, string>();

    constructor(
        private readonly jwt: JwtService,
        private readonly jose: JoseService,
        @Inject(REDIS) private readonly redis: Redis,
        @InjectModel(EaInstance.name)
        private readonly instanceModel: Model<EaInstanceDocument>,
    ) {}

    async handleConnection(client: Socket) {
        const token = client.handshake.auth?.token as string | undefined;
        if (!token) {
            this.logger.warn(`WS /console rejected: no token id=${client.id}`);
            client.disconnect(true);
            return;
        }
        try {
            // Try RS256 (browser user JWT) first, fall back to ES256 (bridge membership JWT)
            let payload: Record<string, unknown>;
            let isBridge = false;
            try {
                payload = await this.jwt.verifyAsync(token, {
                    publicKey: fromB64Env('JWT_ACCESS_PUBLIC_KEY_BASE64'),
                    algorithms: ['RS256'],
                });
            } catch {
                payload = await this.jose.verifyToken(token);
                isBridge = true;
            }
            const d = client.data as BridgeSocketData;
            d.userId =
                (payload.userId as string) ?? (payload.sub as string) ?? null;
            d.isBridge = isBridge;
            d.licenseKey = (payload.licenseKey as string | undefined) ?? null;
            d.accountLogin =
                (payload.accountLogin as string | undefined) ?? null;
        } catch {
            this.logger.warn(
                `WS /console rejected: invalid token id=${client.id}`,
            );
            client.disconnect(true);
            return;
        }
        this.logger.log(`WS /console connected id=${client.id}`);
    }

    async handleDisconnect(client: Socket) {
        const d = client.data as BridgeSocketData;
        const agentId = d.agentId ?? 'none';
        this.logger.log(
            `WS /console disconnected id=${client.id} agentId=${agentId}`,
        );

        if (d.isBridge && d.agentId) {
            await this.instanceModel.updateOne(
                { agentId: d.agentId },
                { $set: { online: false } },
            );
            this.io.to(`agent:${d.agentId}`).emit('console:status', {
                agentId: d.agentId,
                online: false,
                lastSeenTs: Date.now(),
            });
        }
    }

    // ── Bridge events ─────────────────────────────────────────────────────────

    @SubscribeMessage('bridge:register')
    async onBridgeRegister(
        @ConnectedSocket() client: BridgeSocket,
        @MessageBody() data: { agentId: string; bridgeVersion?: string },
    ) {
        const { agentId } = data;
        const callerId = client.data.userId;

        // Ownership lock: if instance already exists under a different userId, reject
        const existing = await this.instanceModel
            .findOne({ agentId })
            .lean()
            .exec();
        if (existing?.userId && callerId && existing.userId !== callerId) {
            this.logger.warn(
                `bridge:register REJECTED agentId=${agentId} caller=${callerId} owner=${existing.userId}`,
            );
            client.emit('error', {
                message: 'forbidden: agentId owned by another user',
            });
            client.disconnect(true);
            return;
        }

        client.data.agentId = agentId;
        client.data.isBridge = true;

        // Derive required ea-instance fields. agentId format is
        // `{account}-{symbol}-{buyMagic}-{sellMagic}`; licenseKey is only
        // available when the bridge authenticated via /memberships/activate.
        const parts = agentId.split('-');
        const parsedAccount = parts[0] || null;
        const parsedSymbol = parts[1] || null;
        const accountLogin = client.data.accountLogin ?? parsedAccount;
        const licenseKey = client.data.licenseKey ?? null;
        const symbol = parsedSymbol;

        if (!accountLogin || !licenseKey || !symbol) {
            this.logger.warn(
                `bridge:register missing fields (agentId=${agentId}, accountLogin=${accountLogin}, hasLicenseKey=${!!licenseKey}, symbol=${symbol}) -- skipping upsert`,
            );
            return;
        }

        const room = `agent:${agentId}`;
        void client.join(room);

        await this.instanceModel.findOneAndUpdate(
            { agentId },
            {
                $set: {
                    accountLogin,
                    licenseKey,
                    symbol,
                    online: true,
                    lastSeenAt: new Date(),
                    ...(callerId ? { userId: callerId } : {}),
                },
            },
            { upsert: true, new: true },
        );

        this.logger.log(
            `bridge:register agentId=${agentId} socketId=${client.id}`,
        );
        this.io.to(room).emit('console:status', { agentId, online: true });
    }

    @SubscribeMessage('console:telemetry')
    async onBridgeTelemetry(
        @ConnectedSocket() client: BridgeSocket,
        @MessageBody() telemetry: TelemetryDto,
    ) {
        const agentId = telemetry.agentId ?? client.data.agentId;
        if (!agentId) return;

        const redisKey = `ea:state:${agentId}`;
        await this.redis.setex(
            redisKey,
            TELEMETRY_TTL_SECONDS,
            JSON.stringify(telemetry),
        );

        this.io.to(`agent:${agentId}`).emit('console:telemetry', telemetry);

        await this.instanceModel.updateOne(
            { agentId },
            {
                $set: {
                    online: true,
                    lastTelemetry: telemetry as unknown as Record<
                        string,
                        unknown
                    >,
                    lastSeenAt: new Date(),
                },
            },
        );

        this.io.to(`agent:${agentId}`).emit('console:status', {
            agentId,
            online: true,
            lastSeenTs: Date.now(),
        });
    }

    @SubscribeMessage('console:ack')
    onBridgeAck(
        @ConnectedSocket() client: BridgeSocket,
        @MessageBody() data: { uuid: string },
    ) {
        const agentId = client.data.agentId;

        // Broadcast to agent room so all subscribed browser clients receive the ACK.
        if (agentId) {
            this.io.to(`agent:${agentId}`).emit('console:ack', data);
        }

        // Also send to the specific socket that originated the command (if any).
        const targetSocketId = this.pendingAck.get(data.uuid);
        if (targetSocketId) {
            this.io.to(targetSocketId).emit('console:ack', data);
        }
        this.pendingAck.delete(data.uuid);
    }

    @SubscribeMessage('console:status')
    async onBridgeStatus(
        @ConnectedSocket() client: BridgeSocket,
        @MessageBody()
        data: { agentId: string; online: boolean; lastSeenTs?: number },
    ) {
        const agentId = data.agentId ?? client.data.agentId;
        if (!agentId) return;

        await this.instanceModel.updateOne(
            { agentId },
            { $set: { online: data.online, lastSeenAt: new Date() } },
        );

        this.io.to(`agent:${agentId}`).emit('console:status', {
            agentId,
            online: data.online,
            lastSeenTs: data.lastSeenTs ?? Date.now(),
        });
    }

    @SubscribeMessage('console:offline')
    async onBridgeOffline(
        @ConnectedSocket() client: BridgeSocket,
        @MessageBody() data: { agentId?: string },
    ) {
        const agentId = data?.agentId ?? client.data.agentId;
        if (!agentId) return;

        await this.instanceModel.updateOne(
            { agentId },
            { $set: { online: false } },
        );

        this.io.to(`agent:${agentId}`).emit('console:status', {
            agentId,
            online: false,
            lastSeenTs: Date.now(),
        });
    }

    // ── Browser client events ─────────────────────────────────────────────────

    @SubscribeMessage('client:subscribe')
    async onClientSubscribe(
        @ConnectedSocket() client: BridgeSocket,
        @MessageBody() data: { agentId: string },
    ) {
        const { agentId } = data;
        const callerId = client.data.userId;

        // Ownership check: only allow the owner to subscribe
        const instance = await this.instanceModel
            .findOne({ agentId })
            .lean()
            .exec();
        if (instance?.userId && callerId && instance.userId !== callerId) {
            client.emit('error', { message: 'forbidden' });
            client.disconnect(true);
            return;
        }

        client.data.agentId = agentId;
        void client.join(`agent:${agentId}`);

        const cached = await this.redis.get(`ea:state:${agentId}`);
        if (cached) {
            try {
                client.emit('console:hydrate', JSON.parse(cached));
            } catch {
                // invalid JSON in cache — skip hydration
            }
        }
    }

    @SubscribeMessage('client:unsubscribe')
    onClientUnsubscribe(
        @ConnectedSocket() client: BridgeSocket,
        @MessageBody() data: { agentId: string },
    ) {
        void client.leave(`agent:${data.agentId}`);
    }

    // ── Helpers (called from ConsoleService) ──────────────────────────────────

    sendCommandToBridge(
        agentId: string,
        commandId: string,
        verb: string,
        value?: string,
    ) {
        this.pendingAck.set(commandId, ''); // will be set with actual socket ID in service
        this.io
            .to(`agent:${agentId}`)
            .emit('bridge:command', { commandId, verb, value });
    }

    sendCommandToBridgeWithAck(
        agentId: string,
        commandId: string,
        originSocketId: string,
        verb: string,
        value?: string,
    ) {
        this.pendingAck.set(commandId, originSocketId);
        this.io
            .to(`agent:${agentId}`)
            .emit('bridge:command', { commandId, verb, value });
    }

    emitToRoom(room: string, event: string, payload: unknown) {
        this.io.to(room).emit(event, payload);
    }
}
