import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Job, Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { InjectQueue } from '@nestjs/bullmq';

import { REDIS } from '../redis/redis.constants';
import { EaInstance, EaInstanceDocument } from './schemas/ea-instance.schema';
import { AuditEvent } from './schemas/ea-audit-log.schema';
import { ConsoleGateway } from './console.gateway';
import { ConsoleService } from './console.service';
import { WebPushSubService } from '../web-push-sub/web-push-sub.service';
import { Types } from 'mongoose';

const OFFLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

@Processor('console-health')
export class HealthCheckProcessor extends WorkerHost {
    private readonly logger = new Logger(HealthCheckProcessor.name);

    constructor(
        @Inject(REDIS) private readonly redis: Redis,
        @InjectModel(EaInstance.name)
        private readonly instanceModel: Model<EaInstanceDocument>,
        private readonly gateway: ConsoleGateway,
        private readonly consoleService: ConsoleService,
        private readonly pushService: WebPushSubService,
        @Optional()
        @InjectQueue('console-health')
        private readonly queue?: Queue,
    ) {
        super();
    }

    async process(job: Job): Promise<void> {
        switch (job.name) {
            case 'check-heartbeat':
                await this.checkHeartbeat();
                break;
            case 'send-offline-alert':
                await this.sendOfflineAlert(
                    job.data as {
                        agentId: string;
                        userId?: string;
                        symbol: string;
                        accountLogin: string;
                    },
                );
                break;
            case 'send-kill-switch-alert':
                await this.sendKillSwitchAlert(
                    job.data as {
                        agentId: string;
                        userId?: string;
                        symbol: string;
                        accountLogin: string;
                    },
                );
                break;
            default:
                this.logger.warn(`Unknown job: ${job.name}`);
        }
    }

    private async checkHeartbeat(): Promise<void> {
        const onlineInstances = await this.instanceModel
            .find({ online: true })
            .lean()
            .exec();

        for (const instance of onlineInstances) {
            const cached = await this.redis.get(`ea:state:${instance.agentId}`);
            let isStale = !cached;

            if (cached && !isStale) {
                try {
                    const telemetry = JSON.parse(cached) as { ts?: number };
                    const ageMs = Date.now() - (telemetry.ts ?? 0) * 1000;
                    isStale = ageMs > OFFLINE_THRESHOLD_MS;
                } catch {
                    isStale = true;
                }
            }

            if (isStale) {
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

                if (this.queue) {
                    await this.queue.add('send-offline-alert', {
                        agentId: instance.agentId,
                        userId: undefined,
                        symbol: instance.symbol,
                        accountLogin: instance.accountLogin,
                    });
                }

                this.logger.warn(
                    `EA offline (heartbeat timeout): agentId=${instance.agentId}`,
                );
            }
        }
    }

    private async sendOfflineAlert(data: {
        agentId: string;
        userId?: string;
        symbol: string;
        accountLogin: string;
    }): Promise<void> {
        if (!data.userId) return;

        try {
            await this.pushService.sendToUsers(
                [new Types.ObjectId(data.userId)],
                {
                    title: '⚠️ EA Offline',
                    body: `${data.symbol} on account ${data.accountLogin} has been unreachable for 5+ minutes`,
                    tag: `ea-offline-${data.agentId}`,
                },
            );
        } catch (e) {
            this.logger.warn(
                `Failed to send offline push for ${data.agentId}: ${e}`,
            );
        }
    }

    private async sendKillSwitchAlert(data: {
        agentId: string;
        userId?: string;
        symbol: string;
        accountLogin: string;
    }): Promise<void> {
        if (!data.userId) return;

        try {
            await this.pushService.sendToUsers(
                [new Types.ObjectId(data.userId)],
                {
                    title: '🛑 Kill Switch Executed',
                    body: `All positions on ${data.symbol} (${data.accountLogin}) have been closed`,
                    tag: `ea-kill-switch-${data.agentId}`,
                },
            );
        } catch (e) {
            this.logger.warn(
                `Failed to send kill-switch push for ${data.agentId}: ${e}`,
            );
        }
    }
}
