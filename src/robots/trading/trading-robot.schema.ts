import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TradingRobotDocument = HydratedDocument<TradingRobot>;

export enum TradingPlatform {
    MT4 = 'MT4',
    MT5 = 'MT5',
}

@Schema({ collection: 'trading_robots', timestamps: true })
export class TradingRobot {
    @Prop({ type: String, required: true, trim: true, maxlength: 120 })
    name!: string;

    @Prop({ type: String, required: true, trim: true, maxlength: 2000 })
    description!: string;

    @Prop({ type: String, required: true, trim: true, maxlength: 20 })
    version!: string;

    @Prop({
        type: String,
        enum: Object.values(TradingPlatform),
        required: true,
    })
    platform!: TradingPlatform;

    @Prop({ type: String, trim: true, maxlength: 50 })
    fileSize?: string;

    @Prop({ type: String, trim: true, maxlength: 500 })
    downloadUrl?: string;
}

export const TradingRobotSchema = SchemaFactory.createForClass(TradingRobot);

export const DEFAULT_TRADING_ROBOT: Omit<TradingRobot, 'platform'> & {
    platform: TradingPlatform;
} = {
    name: 'Scalper Pro MT4',
    description: 'Advanced scalping EA for MetaTrader 4 with dynamic stop loss',
    version: '2.1.0',
    platform: TradingPlatform.MT4,
    fileSize: '245 KB',
    downloadUrl: '',
};
