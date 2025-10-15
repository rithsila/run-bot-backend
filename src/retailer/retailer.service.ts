// src/retailer/retailer.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Cron } from '@nestjs/schedule';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { RetailLatest } from './retailer.schema';

// Symbols to refresh (edit as needed)
const SYMBOLS = [
    'XAUUSD', 'EURUSD', 'GBPJPY', 'US30', 'NAS100', 'SP500', 'BTCUSD', 'ETHUSD',
];

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

// FastAPI base URL (your scraper)
const SCRAPER_BASE = process.env.SCRAPER_BASE ?? 'http://3.26.210.147/:8000';


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
    ) { }

    /** Small sleep helper for staggering calls */
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
        fetchedAt?: string | Date | null | undefined; // scraper ISO or Date
        rendered?: boolean | undefined;
        runAt: Date | string; // required (your job time)
    }): Promise<void> {
        const pair = (params.pair || '').toUpperCase().trim();
        if (!pair) return;

        const avgLeft = toNumOrNull(params.avgLeft);
        const avgRight = toNumOrNull(params.avgRight);
        const dividerLeftPct = toNumOrNull(params.dividerLeftPct);
        const fetchedAt = toDateOrNull(params.fetchedAt);
        const runAt = toDateOrNull(params.runAt) ?? new Date();

        // make sure signal is one of the allowed values (or null)
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
    }

    async getLatest() {
        return this.latestModel.find().lean().exec();
    }

    async refreshMany(symbols: string[] = SYMBOLS): Promise<void> {
        for (let i = 0; i < symbols.length; i++) {
            const sym = symbols[i];
            // Stagger: ~1.5s + small jitter to avoid simultaneous hits
            const jitter = Math.floor(Math.random() * 400);
            await this.sleep(1500 + jitter);
            await this.refreshOne(sym);
        }
    }

    async refreshOne(symbol: string): Promise<void> {
        const sym = symbol.toUpperCase();
        try {
            const { data } = await firstValueFrom(
                this.http.get<ScraperResponse>(`${SCRAPER_BASE}/fxssi/current-ratio`, {
                    params: { symbol: sym },
                    // optional: short timeout per call, since your FastAPI already has its own timeout
                    timeout: 15000,
                }),
            );

            if (!data?.ok || !data.data) {
                // Include server detail if available
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
            // print HTTP status + body detail if Axios error
            const status = err?.response?.status;
            const detail = err?.response?.data?.detail ?? err?.message ?? String(err);
            this.log.warn(`refreshOne ${sym} failed: ${status ?? ''} ${detail}`);
        }
    }

    // Every 3 minutes (your log said 3m, but cron was */5)
    @Cron('*/1 * * * *')
    async cronRefresh() {
        const start = Date.now();
        this.log.log('RetailerService cron: FXSSI refresh tick (3m)…');

        // Optional: quick preflight health check to avoid spamming logs when scraper is down
        try {
            await firstValueFrom(this.http.get(`${SCRAPER_BASE}/health`, { timeout: 5000 }));
        } catch (e: any) {
            const status = e?.response?.status;
            const detail = e?.response?.data?.detail ?? e?.message ?? String(e);
            this.log.warn(`Scraper health failed: ${status ?? ''} ${detail}`);
            return;
        }

        await this.refreshMany(SYMBOLS);
        this.log.log(`RetailerService cron done in ${Date.now() - start}ms`);
    }
}
