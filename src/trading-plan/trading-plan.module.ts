import { Module } from '@nestjs/common';
import { TradingPlanService } from './trading-plan.service';
import { TradingPlanController } from './trading-plan.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { TradingPlan, TradingPlanSchema } from './trading-plan.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: TradingPlan.name, schema: TradingPlanSchema }])],
  providers: [TradingPlanService],
  controllers: [TradingPlanController]
})
export class TradingPlanModule { }
