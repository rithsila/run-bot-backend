// src/retailer/retailer.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { RetailLatest } from './retail-latest.schema';
import { RetailPair } from './pairs.enum';
import { RedisService } from 'src/redis/redis.service';


type RetailRow = {
    name?: string;
    ratioLeft?: number | null;
    ratioRight?: number | null;
    signal?: 'buy' | 'sell' | 'neutral' | null;
};


@Injectable()
export class RetailerService {
    constructor(
        @InjectModel(RetailLatest.name)
        private readonly latestModel: Model<RetailLatest>,
        private readonly redis: RedisService,
    ) { }

    /**
     * Upsert the "latest" record for a currency pair.
     * Keeps only ONE document per pair in Mongo.
     */
    async upsertLatest(params: {
        pair: string;
        avgLeft: number | null | undefined;
        avgRight: number | null | undefined;
        signal: string | null | undefined;  // 'buy' | 'sell' | 'neutral' | null
        runAt: Date;
    }): Promise<void> {
        const pair = (params.pair || '').toUpperCase();
        if (!pair) return;

        await this.latestModel.updateOne(
            { pair },
            {
                $set: {
                    pair,
                    avgLeft: params.avgLeft ?? null,
                    avgRight: params.avgRight ?? null,
                    signal: params.signal ?? null,
                    runAt: params.runAt,
                },
            },
            { upsert: true },
        ).exec();
    }

    async getLatest() {
        return this.latestModel.find().lean().exec();
    }


}
