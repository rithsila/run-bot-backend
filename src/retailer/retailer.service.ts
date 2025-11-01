// src/retailer/retailer.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Cron } from '@nestjs/schedule';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { RetailLatest } from './retailer.schema';
import { WebPushSubService } from 'src/web-push-sub/web-push-sub.service';
import { RealtimeGateway } from 'src/real-time/realtime.gateway';

// Symbols to refresh
const SYMBOLS = ['XAUUSD', 'EURUSD', 'GBPJPY', 'US30', 'NAS100', 'SP500', 'BTCUSD', 'ETHUSD'];

type Signal = 'buy' | 'sell' | 'neutral' | null;

function toNumOrNull(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}
function toDateOrNull(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}
function nearlyEqual(a: number | null | undefined, b: number | null | undefined, eps = 0.01) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(Number(a) - Number(b)) <= eps;
}
function sanitizeSignal(s: any): Signal {
  return s === 'buy' || s === 'sell' || s === 'neutral' ? s : null;
}

// --- Base URL handling ---
const RAW_BASE = process.env.SCRAPER_BASE || 'http://127.0.0.1:8000';
const SCRAPER_BASE = RAW_BASE.replace(/\/+$/, ''); // strip trailing '/'
function buildUrl(path: string) {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${SCRAPER_BASE}${p}`;
}

type ScraperResponse = {
  ok: boolean;
  data?: {
    symbol: string;
    left_pct: number;
    right_pct: number;
    divider_left_pct?: number | null;
    signal: 'buy' | 'sell' | 'neutral';
    sourceUrl: string;
    fetchedAt: string;
    rendered?: boolean;
  };
  error?: string;
};

@Injectable()
export class RetailerService {
  private readonly log = new Logger(RetailerService.name);

  constructor(
    @InjectModel(RetailLatest.name)
    private readonly latestModel: Model<RetailLatest>,
    private readonly http: HttpService,
    private readonly push: WebPushSubService,
    private readonly realtime: RealtimeGateway
  ) { }

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async upsertLatest(params: {
    pair: string;
    avgLeft: number | null | undefined;
    avgRight: number | null | undefined;
    dividerLeftPct?: number | null | undefined;
    signal: Signal | undefined;
    rowLabel?: string | undefined;
    sourceUrl?: string | undefined;
    fetchedAt?: string | Date | null | undefined;
    rendered?: boolean | undefined;
    runAt: Date | string;
  }): Promise<void> {
    const pair = (params.pair || '').toUpperCase().trim();
    if (!pair) return;

    const avgLeft = toNumOrNull(params.avgLeft);
    const avgRight = toNumOrNull(params.avgRight);
    const dividerLeftPct = toNumOrNull(params.dividerLeftPct);
    const fetchedAt = toDateOrNull(params.fetchedAt);
    const runAt = toDateOrNull(params.runAt) ?? new Date();

    const sig = ((): Signal => {
      const s = (params.signal ?? null) as Signal;
      return s === 'buy' || s === 'sell' || s === 'neutral' ? s : null;
    })();

    await this.latestModel.updateOne(
      { pair },
      {
        $set: {
          pair,
          avgLeft,
          avgRight,
          dividerLeftPct: dividerLeftPct ?? null,
          signal: sig,
          rowLabel: params.rowLabel ?? 'Average',
          sourceUrl: params.sourceUrl ?? undefined,
          fetchedAt: fetchedAt ?? undefined,
          rendered: params.rendered ?? false,
          runAt,
        },
      },
      { upsert: true },
    ).exec();
    this.realtime.publishBadge('retailer');

  }

  async getLatest() {
    return this.latestModel.find().lean().exec();
  }

  async refreshOne(symbol: string): Promise<void> {
    const sym = symbol.toUpperCase();
    try {
      const url = buildUrl('/fxssi/current-ratio');
      const { data } = await firstValueFrom(
        this.http.get<ScraperResponse>(url, {
          params: { symbol: sym },
          timeout: 5_000, // ms
        }),
      );

      if (!data?.ok || !data.data) {
        const detail = (data as any)?.detail || 'bad payload';
        throw new Error(`Scraper bad response for ${sym}: ${detail}`);
      }

      const d = data.data;
      await this.upsertLatest({
        pair: sym,
        avgLeft: d.left_pct,
        avgRight: d.right_pct,
        dividerLeftPct: d.divider_left_pct ?? null,
        signal: d.signal,
        rowLabel: 'Average',
        sourceUrl: d.sourceUrl,
        fetchedAt: d.fetchedAt,
        rendered: !!d.rendered,
        runAt: new Date(),
      });

      this.log.debug(`${sym} refreshed: ${d.left_pct}/${d.right_pct} signal=${d.signal} rendered=${d.rendered ?? false}`);
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail ?? err?.message ?? String(err);
      this.log.warn(`refreshOne ${sym} failed: ${status ?? ''} ${detail}`);
    }
  }

  async refreshMany(symbols: string[] = SYMBOLS): Promise<void> {
    for (let i = 0; i < symbols.length; i++) {
      const sym = symbols[i];
      const jitter = Math.floor(Math.random() * 400);
      await this.sleep(1500 + jitter);
      await this.refreshOne(sym);
    }
  }

  // Every 3 minutes (update message to match)
  @Cron('*/5 * * * *')
  async cronRefresh() {
    const start = Date.now();
    this.log.log('RetailerService cron refresh tick 5m');

    // 1) Preflight health (skip tick if scraper is down)
    try {
      await firstValueFrom(this.http.get(`${SCRAPER_BASE.replace(/\/+$/, '')}/health`, { timeout: 5_000 }));
    } catch (e: any) {
      const status = e?.response?.status;
      const detail = e?.response?.data?.detail ?? e?.message ?? String(e);
      this.log.warn(`Scraper health failed: ${status ?? ''} ${detail}`);
      return;
    }

    // 2) Snapshot current DB state for all symbols (for comparisons)
    const prevDocs = await this.latestModel
      .find({ pair: { $in: SYMBOLS } })
      .lean()
      .exec();
    const prevMap = new Map(prevDocs.map(d => [String(d.pair).toUpperCase(), d]));

    let changes = 0;
    let errors = 0;

    // 3) Iterate symbols with small stagger so we don't hammer the scraper
    for (const sym of SYMBOLS) {
      const jitter = Math.floor(Math.random() * 400);
      await this.sleep(1500 + jitter);

      try {
        const { data } = await firstValueFrom(
          this.http.get<ScraperResponse>(`${SCRAPER_BASE.replace(/\/+$/, '')}/fxssi/current-ratio`, {
            params: { symbol: sym },
            timeout: 5_000,
          }),
        );
        if (!data?.ok || !data.data) {
          const detail = (data as any)?.detail || 'bad payload';
          throw new Error(`Scraper bad response for ${sym}: ${detail}`);
        }

        const d = data.data;
        const prev = prevMap.get(sym);

        const nextSignal = sanitizeSignal(d.signal);
        const prevSignal = sanitizeSignal(prev?.signal ?? null);

        const leftChanged = !nearlyEqual(prev?.avgLeft, d.left_pct);
        const rightChanged = !nearlyEqual(prev?.avgRight, d.right_pct);
        const sigChanged = prevSignal !== nextSignal;

        await this.upsertLatest({
          pair: sym,
          avgLeft: d.left_pct,
          avgRight: d.right_pct,
          dividerLeftPct: d.divider_left_pct ?? null,
          signal: nextSignal,
          rowLabel: 'Average',
          sourceUrl: d.sourceUrl,
          fetchedAt: d.fetchedAt,
          rendered: !!d.rendered,
          runAt: new Date(),
        });

        changes++;

        if (sigChanged && prev) {
          this.log.log(
            `[signal-change] ${sym}: ${prevSignal ?? 'null'} -> ${nextSignal ?? 'null'} ` +
            `(L=${d.left_pct} R=${d.right_pct})`
          );
          const title = `Retailer changed · ${sym} · ${prevSignal?.toUpperCase()} → ${nextSignal?.toUpperCase()}`;
          const body = `Long ${d.left_pct}% · Short ${d.right_pct}%`;

          const url = `/retail/latest/${sym}`;

          void this.push.broadcast(
            {
              title,
              body,
              url,
              ts: Date.now(),
            },
            60, // TTL seconds
          );

        } else if (!prev) {
          this.log.debug(`[signal-init] ${sym}: ${nextSignal ?? 'null'} (first record)`);
        } else {
          this.log.debug(`[update] ${sym}: ${[
            leftChanged && 'avgLeft',
            rightChanged && 'avgRight',
          ].filter(Boolean).join(', ')} changed`);
        }

      } catch (err: any) {
        const status = err?.response?.status;
        const detail = err?.response?.data?.detail ?? err?.message ?? String(err);
        this.log.warn(`refreshOne ${sym} failed: ${status ?? ''} ${detail}`);
        errors++;
      }
    }

    this.log.log(`RetailerService cron done in ${Date.now() - start}ms — changes=${changes}, errors=${errors}`);
  }
}
