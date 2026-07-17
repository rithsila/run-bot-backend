import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    MessageBody,
    ConnectedSocket,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { TtlCache } from '../common/cache/ttl-cache';
import { verifySafetyScoreToken } from '../common/auth/safetyscore-token';
import { EaInstance, EaInstanceDocument } from './schemas/ea-instance.schema';
import { TelemetryDto } from './dto/telemetry.dto';

const TELEMETRY_TTL_SECONDS = 60;

interface BridgeSocketData {
    userId: string | null;
    isBridge: boolean;
    agentId?: string;
    licenseKey: string | null;
    accountLogin: string | null;
    symbol: string | null;
}

type BridgeSocket = Omit<Socket, 'data'> & { data: BridgeSocketData };

@WebSocketGateway({ namespace: '/console' })
export class ConsoleGateway
    implements OnGatewayConnection, OnGatewayDisconnect
{
    @WebSocketServer() io!: Server;
    private readonly logger = new Logger(ConsoleGateway.name);

    // In-process telemetry cache (replaces the Redis `ea:state:{agentId}` cache).
    private readonly telemetryCache = new TtlCache();

    // agentId → socket id of the CURRENT bridge connection for that agent.
    // A new registration for the same agentId kicks the stale socket, and a
    // stale socket's late disconnect can no longer mark the agent offline.
    private readonly bridgeSockets = new Map<string, string>();

    constructor(
        @InjectModel(EaInstance.name)
        private readonly instanceModel: Model<EaInstanceDocument>,
    ) {}

    /** Read the latest cached telemetry for an agent (used by ConsoleService). */
    getCachedState(agentId: string): string | null {
        return this.telemetryCache.get(`ea:state:${agentId}`);
    }

    async handleConnection(client: Socket) {
        const token = client.handshake.auth?.token as string | undefined;
        if (!token) {
            this.logger.warn(`WS /console rejected: no token id=${client.id}`);
            client.disconnect(true);
            return;
        }
        try {
            // Single ES256 verify against the SafetyScore public key.
            const verified = await verifySafetyScoreToken(token);
            const d = client.data as BridgeSocketData;
            d.userId = verified.userId;
            // A connection is a bridge if it carries agent-binding claims.
            d.isBridge = !!verified.agentId;
            d.agentId = verified.agentId ?? undefined;
            d.licenseKey = verified.licenseKey;
            d.accountLogin = verified.accountLogin;
            d.symbol = verified.symbol;
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
            // Owner check: only the CURRENT socket for this agent may flip it
            // offline. A kicked/stale socket's late disconnect is a no-op.
            if (this.bridgeSockets.get(d.agentId) !== client.id) {
                this.logger.log(
                    `stale bridge socket disconnect ignored agentId=${d.agentId} id=${client.id}`,
                );
                return;
            }
            this.bridgeSockets.delete(d.agentId);
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
        @MessageBody() data: { agentId?: string; bridgeVersion?: string },
    ) {
        if (!client.data.isBridge) return;
        // v2: the agentId is BOUND to the token claim. The payload may repeat
        // it, but may never override it — a bridge presenting agent A's token
        // cannot register as agent B.
        const tokenAgentId = client.data.agentId;
        const callerId = client.data.userId;
        if (!tokenAgentId) {
            this.logger.warn(
                'bridge:register missing token agent claim -- skipping',
            );
            return;
        }
        if (data.agentId && data.agentId !== tokenAgentId) {
            this.logger.warn(
                `bridge:register agentId mismatch token=${tokenAgentId} payload=${data.agentId} -- disconnecting`,
            );
            client.emit('error', {
                message: 'forbidden: agentId does not match token',
            });
            client.disconnect(true);
            return;
        }
        const agentId = tokenAgentId;

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

        // Duplicate-connection handling: newest registration wins.
        const staleId = this.bridgeSockets.get(agentId);
        if (staleId && staleId !== client.id) {
            this.logger.warn(
                `bridge:register takeover agentId=${agentId} old=${staleId} new=${client.id}`,
            );
            this.io.in(staleId).disconnectSockets(true);
        }
        this.bridgeSockets.set(agentId, client.id);

        client.data.agentId = agentId;
        client.data.isBridge = true;

        // Required ea-instance fields come from the verified token claims.
        // agentId format is `{account}-{symbol}-{buyMagic}-{sellMagic}`; fall
        // back to parsing it only when a claim is absent.
        const parts = agentId.split('-');
        const accountLogin = client.data.accountLogin ?? parts[0] ?? null;
        const symbol = client.data.symbol ?? parts[1] ?? null;
        const licenseKey = client.data.licenseKey ?? null;

        if (!accountLogin || !licenseKey || !symbol || !callerId) {
            this.logger.warn(
                `bridge:register missing fields (agentId=${agentId}, accountLogin=${accountLogin}, hasLicenseKey=${!!licenseKey}, symbol=${symbol}, hasUser=${!!callerId}) -- skipping upsert`,
            );
            return;
        }

        // The bridge does not need to be in the browser (`agent:`) room —
        // every emit it receives is addressed to `bridge:`, keeping bridge
        // command traffic invisible to browser clients in the same room.
        void client.join(`bridge:${agentId}`);

        // Persist the instance so the browser can subscribe afterwards. This
        // MUST land before any client:subscribe for the same agentId succeeds.
        await this.instanceModel.findOneAndUpdate(
            { agentId },
            {
                $set: {
                    accountLogin,
                    licenseKey,
                    symbol,
                    userId: callerId,
                    online: true,
                    lastSeenAt: new Date(),
                },
            },
            { upsert: true, new: true },
        );

        this.logger.log(
            `bridge:register agentId=${agentId} socketId=${client.id}`,
        );
        this.io
            .to(`agent:${agentId}`)
            .emit('console:status', { agentId, online: true });
    }

    @SubscribeMessage('console:telemetry')
    async onBridgeTelemetry(
        @ConnectedSocket() client: BridgeSocket,
        @MessageBody() telemetry: TelemetryDto,
    ) {
        if (!client.data.isBridge) return;
        const agentId = telemetry.agentId ?? client.data.agentId;
        if (!agentId) return;

        this.telemetryCache.setex(
            `ea:state:${agentId}`,
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
        if (!client.data.isBridge) return;
        const agentId = client.data.agentId;

        // Broadcast to agent room so all subscribed browser clients receive the ACK.
        if (agentId) {
            this.io.to(`agent:${agentId}`).emit('console:ack', data);
        }
    }

    @SubscribeMessage('console:status')
    async onBridgeStatus(
        @ConnectedSocket() client: BridgeSocket,
        @MessageBody()
        data: { online: boolean; lastSeenTs?: number },
    ) {
        if (!client.data.isBridge) return;
        const agentId = client.data.agentId;
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
    async onBridgeOffline(@ConnectedSocket() client: BridgeSocket) {
        if (!client.data.isBridge) return;
        const agentId = client.data.agentId;
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

        // Ownership check: only allow the owner to subscribe.
        // Reject when instance is missing, unclaimed, or owned by a different user.
        const instance = await this.instanceModel
            .findOne({ agentId })
            .lean()
            .exec();
        if (!instance || instance.userId !== callerId) {
            client.emit('error', { message: 'forbidden' });
            client.disconnect(true);
            return;
        }

        client.data.agentId = agentId;
        void client.join(`agent:${agentId}`);

        const cached = this.telemetryCache.get(`ea:state:${agentId}`);
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
        this.io
            .to(`bridge:${agentId}`)
            .emit('bridge:command', { commandId, verb, value });
    }

    emitToRoom(room: string, event: string, payload: unknown) {
        this.io.to(room).emit(event, payload);
    }
}
