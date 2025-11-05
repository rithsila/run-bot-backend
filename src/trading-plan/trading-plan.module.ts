import { Module } from '@nestjs/common';
import { TradingPlanService } from './trading-plan.service';
import { TradingPlanController } from './trading-plan.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { TradingPlan, TradingPlanSchema } from './trading-plan.schema';
import { WebPushSubModule } from 'src/web-push-sub/web-push-sub.module';
import { RealtimeModule } from 'src/real-time/real-time.module';
import { QueueModule } from 'src/queue/queue.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: TradingPlan.name, schema: TradingPlanSchema }]),
    WebPushSubModule,
    RealtimeModule,
    QueueModule
  ],
  providers: [TradingPlanService],
  controllers: [TradingPlanController]
})
export class TradingPlanModule { }
