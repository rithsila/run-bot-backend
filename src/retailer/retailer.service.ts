// src/retailer/retailer.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { Retailer } from './retailer.schema';
import { WebPushSubService } from 'src/web-push-sub/web-push-sub.service';
import { PushProducer } from 'src/queue/push.producer';

export type PairRow = Record<string, string | number>;
export type PairsBlock = Record<string, PairRow>;

export type FxssiResponse = {
  pairs?: PairsBlock;
  server_time?: number;
  server_time_text?: string;
};

export type RetailRow = {
  pair?: string;
  avgLeft?: number | null;   // 0..100
  avgRight?: number | null;  // 0..100
  signal?: 'buy' | 'sell' | 'neutral' | null;
  runAt: string;
};

const currency_pairs = [
  'BTCUSD', 'ETHUSD', 'GBPJPY',
  'EURUSD', 'XAUUSD',
  'US30', 'NAS100',
  'SP500',
];

function toNum(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function getSignal(avgLeft: number): 'buy' | 'sell' | 'neutral' {
  if (avgLeft >= 55) return 'buy';
  if (avgLeft <= 45) return 'sell';
  return 'neutral';
}

@Injectable()
export class RetailerService {
  private readonly logger = new Logger(RetailerService.name);
  private isRunning = false; // prevent overlap

  constructor(
    @InjectModel(Retailer.name)
    private readonly retailerModel: Model<Retailer>,
    private readonly pushProducer: PushProducer,
    private readonly webPushSubService: WebPushSubService,
  ) {}

  async fetchRetailRows(): Promise<RetailRow[]> {
    const url = `https://fxssi.com/api/current-ratios?user_id=0&rand=${Math.random()}`;

    const upstream = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'retailer-panel/1.0' },
    });

    if (!upstream.ok) {
      const err = new Error(`Upstream error ${upstream.status}`);
      (err as any).statusCode = 502;
      throw err;
    }

    const data = (await upstream.json()) as FxssiResponse;

    const pairs = data.pairs ?? {};
    const runAt = data.server_time
      ? new Date(data.server_time * 1000).toISOString()
      : new Date().toISOString();

    const rows: RetailRow[] = [];
    for (const desired of currency_pairs) {
      const row = (pairs as any)[desired];
      if (!row) continue;

      const avg = toNum(row['average']);
      if (avg === null) continue;

      const avgLeft = Math.max(0, Math.min(100, Number(avg.toFixed(2))));
      const avgRight = Number((100 - avgLeft).toFixed(2));

      rows.push({
        pair: desired,
        avgLeft,
        avgRight,
        signal: getSignal(avgLeft),
        runAt,
      });
    }

    // Persist per pair: findOne -> upsert; log and notify if signal changed
    for (const r of rows) {
      const pair = r.pair!.toUpperCase();
      const next = r.signal!;

      const prevDoc = await this.retailerModel
        .findOne({ pair })
        .select('signal')
        .lean();

      const prev = prevDoc?.signal ?? null;

      await this.retailerModel.updateOne(
        { pair }, // keep one doc per pair (latest snapshot)
        {
          $set: {
            pair,
            avgLeft: r.avgLeft as number,
            avgRight: r.avgRight as number,
            signal: next,
            runAt: new Date(r.runAt),
          },
        },
        { upsert: true },
      );

      if (prev !== null && prev !== next) {
        const at = new Date(r.runAt).toISOString();
        const msg = `√ Signal change ${pair}: ${prev} -> ${next} @ ${at}`;
        console.log(msg);
        this.logger.log(msg);

        try {
          const tinyPayload = {
            title: `Retailer changed · ${pair} · ${prev?.toUpperCase()} → ${next?.toUpperCase()}`,
            body: `Retailer changed • ${pair} • ${next}`,
          };
          const excludeId: Types.ObjectId | null = null;
          const recipients = await this.webPushSubService.getUserIdsExcept(
            excludeId ?? new Types.ObjectId('000000000000000000000000'),
          );
          if (recipients.length) {
            await this.pushProducer.enqueueSendToUsers(
              recipients,
              tinyPayload,
              { ttl: 3600, chunkSize: 500 },
            );
          }
        } catch (e) {
          console.warn('[Retailer.changed] push enqueue failed:', e);
        }
      }
    }

    return rows;
  }

  // Run every 10 minutes (server time) — set timeZone if you want local
  @Cron(CronExpression.EVERY_10_MINUTES, { timeZone: 'Asia/Phnom_Penh' })
  async cronRefresh() {
    if (this.isRunning) {
      this.logger.warn('Previous cron still running, skipping.');
      return;
    }
    this.isRunning = true;

    const start = Date.now();
    try {
      const rows = await this.fetchRetailRows(); // <-- actually run it
      this.logger.log(`Cron OK: fetched ${rows.length} pairs in ${Date.now() - start}ms`);
    } catch (err: any) {
      this.logger.error(`Cron failed in ${Date.now() - start}ms: ${err?.message ?? err}`);
    } finally {
      this.isRunning = false;
    }
  }
}
