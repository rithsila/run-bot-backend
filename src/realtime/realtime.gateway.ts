// src/realtime/realtime.gateway.ts
import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  ConnectedSocket, MessageBody, OnGatewayConnection
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
@WebSocketGateway({
  namespace: '/realtime',
  transports: ['websocket'],
  cors: { origin: true, credentials: true },
})
export class RealtimeGateway implements OnGatewayConnection {
  private readonly log = new Logger(RealtimeGateway.name);
  @WebSocketServer() server!: Server;

  async handleConnection(client: Socket) {
    await client.join('RealTime');
    this.log.debug(`CONNECT id=${client.id} rooms=${JSON.stringify([...client.rooms])}`);
    client.emit('rt:connected', { ok: true, rooms: [...client.rooms] });
  }

  @SubscribeMessage('room:join')
  async joinRooms(@MessageBody() body: { rooms?: string[] }, @ConnectedSocket() s: Socket) {
    const rooms = Array.from(new Set(body?.rooms ?? [])).filter(Boolean);
    for (const r of rooms) await s.join(r);
    this.log.debug(`JOIN id=${s.id} rooms=${JSON.stringify(rooms)}`);
    s.emit('room:joined', { rooms });
  }

  async emitToRoom(room: string, event: string, payload: unknown) {
    const sockets = await this.server.in(room).fetchSockets();
    this.log.debug(`emit ${event} -> room="${room}" sockets=${sockets.length} payload=${JSON.stringify(payload)}`);
    this.server.to(room).emit(event, payload);
  }
}
