import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeController } from './real-time.controller';

@Module({
  providers: [RealtimeGateway],
  controllers: [RealtimeController], // optional; remove if you don't want the test endpoint
  exports: [RealtimeGateway],        // so other modules can inject it
})
export class RealtimeModule {}
