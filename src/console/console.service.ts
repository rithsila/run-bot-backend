import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ForbiddenException,
    Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

import { EaInstance, EaInstanceDocument } from './schemas/ea-instance.schema';
import {
    EaAuditLog,
    EaAuditLogDocument,
    AuditEvent,
} from './schemas/ea-audit-log.schema';
import { EaPnlPoint, EaPnlPointDocument } from './schemas/ea-pnl-point.schema';
import { ConsoleGateway } from './console.gateway';
import { TelemetryDto } from './dto/telemetry.dto';

// Canonical EA settings whitelist (RB-54).
//
// SOURCE OF TRUTH: the EA's real `input` params in
// `console panel/EA Sn1P3r Grid Hunter/Sn1P3r Grid Hunter.mq5`, mirrored by
// the SafetyScore web schema `web/src/lib/run-bot/settings-schema.ts`
// (`LIVE_SETTINGS_KEYS`). Keep these two lists in sync.
//
// ALLOWED_SETTINGS_KEYS = keys the EA can apply WHILE RUNNING (live).
// RESTART_REQUIRED_KEYS = real EA params that feed indicator handles created in
// OnInit (iATR/iBands/iStochastic) or define position identity (magic numbers).
// Pushing them mid-trade is a safety bug, so they are rejected here too —
// defense in depth behind the UI, which renders them read-only.
const ALLOWED_SETTINGS_KEYS = new Set([
    // Trading direction
    'EnableBuy',
    'EnableSell',
    // Lot sizing
    'StartingLots',
    'LayerMultiplier',
    'MaximumLotSizeCap',
    // Grid
    'UseOpenCandle',
    'PipStep',
    'MaxTrades',
    'PipStepMode',
    // Adaptive pip step (non-handle)
    'ATRSimpleMultiplier',
    'ATRPercentileLookback',
    'MinAdaptiveStepPips',
    'MaxAdaptiveStepPips',
    // Signal gate (non-handle: gate toggles + thresholds)
    'p_G01',
    'p_G06',
    'p_G07',
    'p_G08',
    // Basket take profit (non-handle)
    'EnableBasketTakeProfit',
    'BasketTakeProfitMode',
    'BasketTP_FixedPips',
    'BasketTP_ATRMultiplierK',
    // Equity protection
    'EnableEquityProtection',
    'StopLossDrawdownPercent',
    // Safety filters
    'CheckMarginBeforeTrade',
    'MinFreeMarginPercentRequired',
    'EnableSpreadFilter',
    'MaxSpreadPips',
    'PauseOnExtremeVolatility',
    'PauseIfATRMulAboveNormal',
    'ATRNormalLookbackBars',
    // Daily profit target
    'UseDailyProfitLimit',
    'DailyProfitMode',
    'DailyGrossProfitLimit',
    'DailyProfitMoneyTarget',
    'TargetEquityAmount',
    'CloseAllWhenLimitReached',
    // Session filter
    'EnableSessionFilter',
    'CloseAllOutsideSession',
    'BrokerGMTOffset',
    'TradeAsiaSession',
    'AsiaSessionLocal',
    'TradeLondonSession',
    'LondonSessionLocal',
    'TradeNewYorkSession',
    'NewYorkSessionLocal',
]);

// Real EA params that cannot be applied live (indicator handles / identity).
const RESTART_REQUIRED_KEYS = new Set([
    'ATRPeriod', // iATR handle
    'BBPeriod', // iBands handle
    'BBDeviation', // iBands handle
    'p_G02', // iStochastic timeframe
    'p_G03', // iStochastic K period
    'p_G04', // iStochastic D period
    'p_G05', // iStochastic smoothing
    'BasketTP_ATRSmoothPeriod', // iATR (TP) handle
    'BuyMagicNumber', // position identity
    'SellMagicNumber', // position identity
]);

export interface BulkCommandResult {
    agentId: string;
    ok: boolean;
    commandId?: string;
    error?: string;
}

export interface BulkCommandSummary {
    total: number;
    sent: number;
    results: BulkCommandResult[];
}

@Injectable()
export class ConsoleService {
    private readonly logger = new Logger(ConsoleService.name);

    constructor(
        @InjectModel(EaInstance.name)
        private readonly instanceModel: Model<EaInstanceDocument>,
        @InjectModel(EaAuditLog.name)
        private readonly auditModel: Model<EaAuditLogDocument>,
        @InjectModel(EaPnlPoint.name)
        private readonly pnlModel: Model<EaPnlPointDocument>,
        private readonly gateway: ConsoleGateway,
    ) {}

    // ── State ─────────────────────────────────────────────────────────────────

    async getLatestState(
        agentId: string,
        userId: string,
    ): Promise<TelemetryDto | null> {
        await this.requireOwnership(agentId, userId);
        const raw = this.gateway.getCachedState(agentId);
        if (!raw) return null;
        try {
            return JSON.parse(raw) as TelemetryDto;
        } catch {
            return null;
        }
    }

    async getAllInstances(userId: string): Promise<EaInstance[]> {
        return this.instanceModel.find({ userId }).lean().exec();
    }

    async getInstanceStatus(
        agentId: string,
    ): Promise<{ online: boolean; lastSeenAt: Date | null }> {
        const instance = await this.instanceModel
            .findOne({ agentId })
            .lean()
            .exec();
        if (!instance)
            throw new NotFoundException(`EA instance ${agentId} not found`);
        return { online: instance.online, lastSeenAt: instance.lastSeenAt };
    }

    // ── Commands ──────────────────────────────────────────────────────────────

    async sendKillSwitch(
        agentId: string,
        userId: string,
    ): Promise<{ commandId: string }> {
        await this.requireOwnership(agentId, userId);
        await this.requireOnline(agentId);
        const commandId = uuidv4();
        this.gateway.sendCommandToBridge(agentId, commandId, 'KILL_SWITCH');
        await this.logEvent(
            agentId,
            AuditEvent.KillSwitch,
            { commandId },
            userId,
        );
        this.logger.log(
            `kill_switch agentId=${agentId} commandId=${commandId} userId=${userId}`,
        );
        return { commandId };
    }

    async sendKillReset(
        agentId: string,
        userId: string,
    ): Promise<{ commandId: string }> {
        await this.requireOwnership(agentId, userId);
        await this.requireOnline(agentId);
        const commandId = uuidv4();
        this.gateway.sendCommandToBridge(agentId, commandId, 'KILL_RESET');
        await this.logEvent(
            agentId,
            AuditEvent.KillReset,
            { commandId },
            userId,
        );
        this.logger.log(
            `kill_reset agentId=${agentId} commandId=${commandId} userId=${userId}`,
        );
        return { commandId };
    }

    async sendMasterEnable(
        agentId: string,
        enabled: boolean,
        userId: string,
    ): Promise<{ commandId: string }> {
        await this.requireOwnership(agentId, userId);
        await this.requireOnline(agentId);
        const commandId = uuidv4();
        this.gateway.sendCommandToBridge(
            agentId,
            commandId,
            'MASTER_ENABLE',
            enabled ? '1' : '0',
        );
        await this.logEvent(
            agentId,
            AuditEvent.MasterEnable,
            { commandId, enabled },
            userId,
        );
        return { commandId };
    }

    async sendCloseBuy(
        agentId: string,
        userId: string,
    ): Promise<{ commandId: string }> {
        await this.requireOwnership(agentId, userId);
        await this.requireOnline(agentId);
        const commandId = uuidv4();
        this.gateway.sendCommandToBridge(agentId, commandId, 'CLOSE_BUY');
        await this.logEvent(
            agentId,
            AuditEvent.CloseBuy,
            { commandId },
            userId,
        );
        this.logger.log(
            `close_buy agentId=${agentId} commandId=${commandId} userId=${userId}`,
        );
        return { commandId };
    }

    async sendCloseSell(
        agentId: string,
        userId: string,
    ): Promise<{ commandId: string }> {
        await this.requireOwnership(agentId, userId);
        await this.requireOnline(agentId);
        const commandId = uuidv4();
        this.gateway.sendCommandToBridge(agentId, commandId, 'CLOSE_SELL');
        await this.logEvent(
            agentId,
            AuditEvent.CloseSell,
            { commandId },
            userId,
        );
        this.logger.log(
            `close_sell agentId=${agentId} commandId=${commandId} userId=${userId}`,
        );
        return { commandId };
    }

    // ── Bulk commands (v2) ───────────────────────────────────────────────────

    /**
     * Send one verb to every instance in `instances`, collecting per-agent
     * results. Offline instances are reported, never silently skipped.
     */
    private async fanOutCommand(
        instances: Pick<EaInstance, 'agentId' | 'online'>[],
        verb: string,
        value: string | undefined,
        auditEvent: AuditEvent,
        userId: string,
    ): Promise<BulkCommandSummary> {
        const results: BulkCommandResult[] = [];
        for (const inst of instances) {
            if (!inst.online) {
                results.push({
                    agentId: inst.agentId,
                    ok: false,
                    error: 'offline',
                });
                continue;
            }
            const commandId = uuidv4();
            this.gateway.sendCommandToBridge(
                inst.agentId,
                commandId,
                verb,
                value,
            );
            await this.logEvent(
                inst.agentId,
                auditEvent,
                { commandId, bulk: true },
                userId,
            );
            results.push({ agentId: inst.agentId, ok: true, commandId });
        }
        return {
            total: instances.length,
            sent: results.filter((r) => r.ok).length,
            results,
        };
    }

    /** Bulk: master-disable every EA on one account owned by the caller. */
    async stopAccount(
        accountLogin: string,
        userId: string,
    ): Promise<BulkCommandSummary> {
        const instances = await this.instanceModel
            .find({ userId, accountLogin })
            .lean()
            .exec();
        this.logger.log(
            `stop-account accountLogin=${accountLogin} userId=${userId} instances=${instances.length}`,
        );
        return this.fanOutCommand(
            instances,
            'MASTER_ENABLE',
            '0',
            AuditEvent.MasterEnable,
            userId,
        );
    }

    /** Bulk: kill-switch every EA owned by the caller. */
    async killAll(userId: string): Promise<BulkCommandSummary> {
        const instances = await this.instanceModel
            .find({ userId })
            .lean()
            .exec();
        this.logger.log(
            `kill-all userId=${userId} instances=${instances.length}`,
        );
        return this.fanOutCommand(
            instances,
            'KILL_SWITCH',
            undefined,
            AuditEvent.KillSwitch,
            userId,
        );
    }

    async pushSettings(
        agentId: string,
        settings: Record<string, unknown>,
        userId: string,
    ): Promise<{ commandId: string }> {
        await this.requireOwnership(agentId, userId);
        await this.requireOnline(agentId);
        this.validateSettingsKeys(settings);
        const commandId = uuidv4();
        const encoded = Buffer.from(JSON.stringify(settings)).toString(
            'base64',
        );
        this.gateway.sendCommandToBridge(
            agentId,
            commandId,
            'SETTINGS',
            encoded,
        );
        await this.instanceModel.updateOne(
            { agentId },
            { $set: { currentSettings: settings } },
        );
        await this.logEvent(
            agentId,
            AuditEvent.SettingsChange,
            { commandId, keys: Object.keys(settings) },
            userId,
        );
        return { commandId };
    }

    async getCurrentSettings(
        agentId: string,
        userId: string,
    ): Promise<Record<string, unknown> | null> {
        await this.requireOwnership(agentId, userId);
        const instance = await this.instanceModel
            .findOne({ agentId })
            .lean()
            .exec();
        if (!instance)
            throw new NotFoundException(`EA instance ${agentId} not found`);
        return instance.currentSettings ?? null;
    }

    // ── Audit ─────────────────────────────────────────────────────────────────

    async logEvent(
        agentId: string,
        event: AuditEvent,
        payload: unknown,
        userId?: string,
    ): Promise<void> {
        await this.auditModel.create({
            agentId,
            event,
            payload: payload as Record<string, unknown>,
            userId: userId ?? null,
        });
    }

    async getAuditLog(
        agentId: string,
        userId: string,
        limit: number,
    ): Promise<EaAuditLog[]> {
        await this.requireOwnership(agentId, userId);
        return this.auditModel
            .find({ agentId })
            .sort({ createdAt: -1 })
            .limit(Math.min(limit, 200))
            .lean()
            .exec();
    }

    // ── PnL history (RB-60) ─────────────────────────────────────────────────────

    /**
     * Snapshot the agent's current PnL from cached telemetry into Mongo.
     * Called periodically by the scheduler for each online instance. Returns
     * true when a point was written, false when there is no usable telemetry.
     */
    async recordPnlPoint(agentId: string): Promise<boolean> {
        const raw = this.gateway.getCachedState(agentId);
        if (!raw) return false;
        let telemetry: TelemetryDto;
        try {
            telemetry = JSON.parse(raw) as TelemetryDto;
        } catch {
            return false;
        }
        const account = telemetry.account;
        if (!account || typeof account.equity !== 'number') return false;

        await this.pnlModel.create({
            agentId,
            ts: (telemetry.ts ?? 0) * 1000,
            equity: account.equity,
            balance: account.balance,
            totalPnl: telemetry.positions?.totalPnl ?? 0,
            dailyPnl: account.dailyPnl ?? 0,
        });
        return true;
    }

    async getPnlHistory(
        agentId: string,
        userId: string,
        limit: number,
    ): Promise<EaPnlPoint[]> {
        await this.requireOwnership(agentId, userId);
        // Sort newest-first so `.limit()` keeps the most recent points once the
        // collection grows past `limit` (it accumulates one point/minute
        // forever), then reverse back to ascending order for the chart.
        //
        // Cap is generous (100k points ≈ 69 days of continuous 1-min snapshots)
        // so a "full history" request isn't truncated in normal use, while
        // still bounding the worst case for an instance that runs for years.
        const points = await this.pnlModel
            .find({ agentId })
            .sort({ ts: -1 })
            .limit(Math.min(limit, 100_000))
            .lean()
            .exec();
        return points.reverse();
    }

    async getPnlDailySummary(
        agentId: string,
        userId: string,
        start?: string,
        end?: string,
    ): Promise<
        { date: string; dailyPnl: number; balance: number; equity: number }[]
    > {
        await this.requireOwnership(agentId, userId);

        const matchQuery: Record<string, any> = { agentId };

        if (start || end) {
            matchQuery.ts = {};
            if (start) {
                const startTime = Date.parse(`${start}T00:00:00.000Z`);
                if (!isNaN(startTime)) {
                    matchQuery.ts.$gte = startTime;
                }
            }
            if (end) {
                const endTime = Date.parse(`${end}T23:59:59.999Z`);
                if (!isNaN(endTime)) {
                    matchQuery.ts.$lte = endTime;
                }
            }
        }

        return this.pnlModel
            .aggregate([
                { $match: matchQuery },
                { $sort: { ts: 1 } },
                {
                    $group: {
                        _id: {
                            $dateToString: {
                                format: '%Y-%m-%d',
                                date: { $toDate: '$ts' },
                            },
                        },
                        dailyPnl: { $last: '$dailyPnl' },
                        balance: { $last: '$balance' },
                        equity: { $last: '$equity' },
                    },
                },
                { $sort: { _id: 1 } },
                {
                    $project: {
                        _id: 0,
                        date: '$_id',
                        dailyPnl: 1,
                        balance: 1,
                        equity: 1,
                    },
                },
            ])
            .exec();
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private async requireOwnership(
        agentId: string,
        userId: string,
    ): Promise<void> {
        const instance = await this.instanceModel
            .findOne({ agentId })
            .lean()
            .exec();
        if (!instance)
            throw new NotFoundException(`EA instance ${agentId} not found`);
        if (instance.userId !== userId)
            throw new ForbiddenException(
                `Access denied to instance ${agentId}`,
            );
    }

    private async requireOnline(agentId: string): Promise<void> {
        const instance = await this.instanceModel
            .findOne({ agentId })
            .lean()
            .exec();
        if (!instance)
            throw new NotFoundException(`EA instance ${agentId} not found`);
        if (!instance.online)
            throw new NotFoundException(`EA instance ${agentId} is offline`);
    }

    private validateSettingsKeys(settings: Record<string, unknown>): void {
        const keys = Object.keys(settings);
        // Restart-required keys are real EA params but cannot be applied live —
        // reject them explicitly so the EA never receives an unsafe mid-trade
        // change (defense in depth behind the read-only UI).
        const restartRequired = keys.filter((k) =>
            RESTART_REQUIRED_KEYS.has(k),
        );
        if (restartRequired.length > 0) {
            throw new BadRequestException(
                `Restart-required settings cannot be changed live: ${restartRequired.join(', ')}`,
            );
        }
        const unknown = keys.filter((k) => !ALLOWED_SETTINGS_KEYS.has(k));
        if (unknown.length > 0) {
            throw new BadRequestException(
                `Unknown settings keys: ${unknown.join(', ')}`,
            );
        }
    }
}
