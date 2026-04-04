// src/real-time/realtime.gateway.ts
import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    MessageBody,
    ConnectedSocket,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { IsString } from 'class-validator';

// --- DTOs ---
class JoinRoomDto {
    @IsString()
    room!: string;
}
class LeaveRoomDto {
    @IsString()
    room!: string;
}

@WebSocketGateway({ namespace: '/realtime' })
export class RealtimeGateway
    implements OnGatewayConnection, OnGatewayDisconnect
{
    @WebSocketServer() io!: Server;
    private readonly logger = new Logger(RealtimeGateway.name);

    handleConnection(client: Socket) {
        const userId = client.handshake.auth?.userId as string | undefined;
        if (userId) {
            client.data.userId = userId;
            client.join(`user:${userId}`);
        }
        this.logger.log(
            `WS connected id=${client.id} user=${userId ?? 'anon'}`,
        );
    }

    handleDisconnect(client: Socket) {
        this.logger.log(`WS disconnected id=${client.id}`);
    }

    @SubscribeMessage('ping')
    ping(@ConnectedSocket() client: Socket, @MessageBody() data?: unknown) {
        client.emit('pong', { at: Date.now(), echo: data ?? null });
    }

    @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
    @SubscribeMessage('join')
    onJoin(@ConnectedSocket() client: Socket, @MessageBody() dto: JoinRoomDto) {
        client.join(dto.room);
        client.emit('joined', { room: dto.room });
    }

    @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
    @SubscribeMessage('leave')
    onLeave(
        @ConnectedSocket() client: Socket,
        @MessageBody() dto: LeaveRoomDto,
    ) {
        client.leave(dto.room);
        client.emit('left', { room: dto.room });
    }

    // === Helpers (call from services) ===
    publishBadge(tabId: string) {
        this.io.emit('content:published', { id: tabId, at: Date.now() });
    }

    emitToRoom(room: string, event: string, payload: unknown) {
        this.io.to(room).emit(event, payload);
    }

    notifyUser(userId: string, event: string, payload: unknown) {
        this.io.to(`user:${userId}`).emit(event, payload);
    }
}
