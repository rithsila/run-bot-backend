// src/retailer/retailer.controller.ts
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Public } from 'src/auth/guard/public.decorator';
import { ApiKeyGuard } from 'src/common/security/api-key.guard';
import { WebhookRealm } from 'src/common/security/webhook-realm.decorator';
import { RedisService } from 'src/redis/redis.service';
import { RetailerService } from './retailer.service';

function isTrue(v: any): boolean {
  return String(v ?? '').trim().toLowerCase() in { '1': 1, true: 1, yes: 1, on: 1 };
}

@Controller('retailer')
export class RetailerController {
  constructor(
    private readonly redis: RedisService,
    private readonly retailer: RetailerService, // Mongo upsert (latest only)
  ) { }

  @Public()
  @Post()
  @UseGuards(ApiKeyGuard)
  @WebhookRealm('retailer')
  @HttpCode(200)
  async handle(@Body() body: any) {
    const items = Array.isArray(body?.items) ? body.items : [];
    const runAtISO = body?.run_at || new Date().toISOString();
    const runAt = new Date(runAtISO);
    console.log("=====", items)
    // Redis TTL for avg signal
    const ttlSec = Number(process.env.RETAIL_AVG_SIGNAL_TTL ?? 7200); // default 2h

    // Toggle Mongo upsert with env
    const doDbUpsert = isTrue(process.env.RETAIL_DB_UPSERT ?? 'true');

    let pushCount = 0;
    let skipCount = 0;
    let upserts = 0;

    await Promise.all(
      items.map(async (it: any) => {
        const pair = String(it?.pair || '').toUpperCase();
        if (!pair) return;

        const nextAvg = it?.average || {};
        const nextSignal = (nextAvg?.signal ?? null) as string | null;
        const avgLeft = nextAvg?.ratioLeft ?? null;
        const avgRight = nextAvg?.ratioRight ?? null;

        // Compare with previous signal in Redis to log PUSH/SKIP
        const prev = await this.redis.getAvgSignal(pair);
        const prevSignal = (prev?.signal ?? null) as string | null;
        const changed =
          (prevSignal ?? null) !== (nextSignal ? String(nextSignal).toLowerCase() : null);

        if (changed) {
          console.log(`[retailer] PUSH  ${pair}: ${prevSignal ?? 'null'} -> ${nextSignal ?? 'null'}`);
          pushCount++;
        } else {
          console.log(`[retailer] SKIP ${pair}: ${nextSignal ?? 'null'} (no change)`);
          skipCount++;
        }

        // 1) Always store signal in Redis
        await this.redis.setAvgSignal({ pair, signal: nextSignal, runAt, ttlSec });

        // 2) Optionally upsert latest averages in Mongo (single doc per pair)
        if (doDbUpsert) {
          await this.retailer.upsertLatest({ pair, avgLeft, avgRight, signal: nextSignal, runAt });
          upserts++;
        }
      }),
    );

    console.log(`[retailer] summary: total=${items.length}, push=${pushCount}, skip=${skipCount}, upserts=${upserts}`);

    return {
      ok: true,
      received: items.length,
      pushed: pushCount,
      skipped: skipCount,
      upserts,
      runAt: runAtISO,
      dbUpsertEnabled: doDbUpsert,
    };
  }

  @Public()
  @Get()
  async latest() {
    return this.retailer.getLatest();
  }

  

}
