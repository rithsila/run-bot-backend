import { Module } from '@nestjs/common';
import { SignalService } from './signal.service';
import { SignalController } from './signal.controller';
import { SignatureGuard } from './signature.guard';
import { ReplayService } from './replay.service';

@Module({
  providers: [
    SignalService,
    SignatureGuard,   
    ReplayService,   
  ],
  controllers: [SignalController]
})
export class SignalModule { }
