import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TradingService } from './trading.service';
import { TradingController } from './trading.controller';
import { TradingRobot, TradingRobotSchema } from './trading-robot.schema';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: TradingRobot.name, schema: TradingRobotSchema },
        ]),
    ],
    providers: [TradingService],
    controllers: [TradingController],
})
export class TradingModule {}
