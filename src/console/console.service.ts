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
import { ConsoleGateway } from './console.gateway';
import { TelemetryDto } from './dto/telemetry.dto';

// Whitelist of known EA parameter keys that may be pushed via settings command.
// Reject payloads containing keys outside this set.
const ALLOWED_SETTINGS_KEYS = new Set([
    'EnableBuy',
    'EnableSell',
    'EnableBasketTakeProfit',
    'BasketTakeProfitMode',
    'StartingLots',
    'LayerMultiplier',
    'MaximumLotSizeCap',
    'MaxTrades',
    'MaxTradesPerSide',
    'PipStep',
    'PipStepMode',
    'EnableSessionFilter',
    'CloseAllOutsideSession',
    'BrokerGMTOffset',
    'TradeAsiaSession',
    'AsiaSessionLocal',
    'TradeLondonSession',
    'LondonSessionLocal',
    'TradeNewYorkSession',
    'NewYorkSessionLocal',
    'EnableEquityProtection',
    'StopLossDrawdownPercent',
    'BuyMagicNumber',
    'SellMagicNumber',
    'Slippage',
    'TradeComment',
]);

@Injectable()
export class ConsoleService {
    private readonly logger = new Logger(ConsoleService.name);

    constructor(
        @InjectModel(EaInstance.name)
        private readonly instanceModel: Model<EaInstanceDocument>,
        @InjectModel(EaAuditLog.name)
        private readonly auditModel: Model<EaAuditLogDocument>,
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
        const unknown = Object.keys(settings).filter(
            (k) => !ALLOWED_SETTINGS_KEYS.has(k),
        );
        if (unknown.length > 0) {
            throw new BadRequestException(
                `Unknown settings keys: ${unknown.join(', ')}`,
            );
        }
    }
}
