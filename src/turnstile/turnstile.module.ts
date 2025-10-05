import { Module } from '@nestjs/common';
import { TurnstileService } from './turnstile.service';
import { TurnstileController } from './turnstile.controller';

@Module({
  providers: [TurnstileService],
  controllers: [TurnstileController],
  exports: [TurnstileService]
})
export class TurnstileModule { }
