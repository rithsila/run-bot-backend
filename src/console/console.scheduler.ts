import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { EaInstance, EaInstanceDocument } from './schemas/ea-instance.schema';
import { AuditEvent } from './schemas/ea-audit-log.schema';
import { ConsoleGateway } from './console.gateway';
import { ConsoleService } from './console.service';

const OFFLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Periodic heartbeat check. Replaces the BullMQ `console-health` queue +
 * HealthCheckProcessor with an in-process cron that reads the gateway's
 * in-memory telemetry cache (no Redis). An instance is marked offline when its
 * cached telemetry is missing or stale.
 */
@Injectable()
export class ConsoleScheduler {
    private readonly logger = new Logger(ConsoleScheduler.name);

    constructor(
        @InjectModel(EaInstance.name)
        private readonly instanceModel: Model<EaInstanceDocument>,
        private readonly gateway: ConsoleGateway,
        private readonly consoleService: ConsoleService,
    ) {}

    @Cron('*/30 * * * * *')
    async checkHeartbeat(): Promise<void> {
        const onlineInstances = await this.instanceModel
            .find({ online: true })
            .lean()
            .exec();

        for (const instance of onlineInstances) {
            const cached = this.gateway.getCachedState(instance.agentId);
            let isStale = !cached;

            if (cached) {
                try {
                    const telemetry = JSON.parse(cached) as { ts?: number };
                    const ageMs = Date.now() - (telemetry.ts ?? 0) * 1000;
                    isStale = ageMs > OFFLINE_THRESHOLD_MS;
                } catch {
                    isStale = true;
                }
            }

            if (!isStale) continue;

            await this.instanceModel.updateOne(
                { agentId: instance.agentId },
                { $set: { online: false } },
            );

            this.gateway.emitToRoom(
                `agent:${instance.agentId}`,
                'console:status',
                {
                    agentId: instance.agentId,
                    online: false,
                    lastSeenTs: Date.now(),
                },
            );

            await this.consoleService.logEvent(
                instance.agentId,
                AuditEvent.BridgeDisconnect,
                { reason: 'heartbeat_timeout' },
            );

            this.logger.warn(
                `EA offline (heartbeat timeout): agentId=${instance.agentId}`,
            );
        }
    }

    /**
     * Periodic PnL snapshot (RB-60). Samples each online instance's cached
     * telemetry once a minute and persists a point so the dashboard chart has a
     * durable history that survives page refresh.
     */
    @Cron('0 * * * * *')
    async recordPnlSnapshots(): Promise<void> {
        const onlineInstances = await this.instanceModel
            .find({ online: true })
            .lean()
            .exec();

        for (const instance of onlineInstances) {
            try {
                await this.consoleService.recordPnlPoint(instance.agentId);
            } catch (err) {
                this.logger.warn(
                    `PnL snapshot failed: agentId=${instance.agentId} err=${String(err)}`,
                );
            }
        }
    }

    /**
     * Every 15s: notify/kick bridge AND browser sockets with expired tokens.
     * 15s cadence means the notify→kick grace is 15s, well inside the
     * bridge's 15s token-refresh timeout window.
     */
    @Cron('*/15 * * * * *')
    sweepExpiredSockets(): void {
        this.gateway.sweepExpiredSockets();
    }
}
