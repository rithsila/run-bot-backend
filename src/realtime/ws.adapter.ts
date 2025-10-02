// src/realtime/ws.adapter.ts
import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';

export class WsAdapter extends IoAdapter {
  constructor(app: INestApplication, private origins: string[]) {
    super(app);
  }
  override createIOServer(port: number, options?: ServerOptions) {
    return super.createIOServer(port, {
      ...options,
      cors: { origin: this.origins, credentials: true },
      transports: ['websocket'],
    });
  }
}
