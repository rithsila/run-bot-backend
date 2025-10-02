// src/realtime/ws-exception.filter.ts
import { ArgumentsHost, Catch, Logger } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';

@Catch()
export class WsExceptionFilter extends BaseWsExceptionFilter {
  private readonly log = new Logger(WsExceptionFilter.name);
  catch(exception: unknown, host: ArgumentsHost) {
    const client = host.switchToWs().getClient();
    const err = exception instanceof WsException ? exception.getError() : exception;
    const message = typeof err === 'string' ? err : (err as any)?.message ?? 'WS Error';
    this.log.warn(message);
    client.emit('rt:error', { message });
  }
}
