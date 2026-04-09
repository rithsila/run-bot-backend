import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';

jest.mock('./console.gateway', () => ({
    ConsoleGateway: jest
        .fn()
        .mockImplementation(() => ({ emitToRoom: jest.fn() })),
}));
jest.mock('./console.service', () => ({
    ConsoleService: jest
        .fn()
        .mockImplementation(() => ({
            logEvent: jest.fn().mockResolvedValue(undefined),
        })),
}));
jest.mock('../web-push-sub/web-push-sub.service', () => ({
    WebPushSubService: jest
        .fn()
        .mockImplementation(() => ({
            sendToUsers: jest.fn().mockResolvedValue(undefined),
        })),
}));

import { HealthCheckProcessor } from './health-check.processor';
import { ConsoleGateway } from './console.gateway';
import { ConsoleService } from './console.service';
import { WebPushSubService } from '../web-push-sub/web-push-sub.service';
import { REDIS } from '../redis/redis.constants';
import { EaInstance } from './schemas/ea-instance.schema';
import { AuditEvent } from './schemas/ea-audit-log.schema';
import { Job } from 'bullmq';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeJob(name: string, data: unknown = {}): Job {
    return { name, data } as unknown as Job;
}

function makeModel(overrides: Record<string, jest.Mock> = {}) {
    return {
        find: jest
            .fn()
            .mockReturnValue({
                lean: () => ({ exec: () => Promise.resolve([]) }),
            }),
        updateOne: jest.fn().mockResolvedValue({}),
        ...overrides,
    };
}

function makeRedis(overrides: Record<string, jest.Mock> = {}) {
    return {
        get: jest.fn().mockResolvedValue(null),
        ...overrides,
    };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('HealthCheckProcessor', () => {
    let processor: HealthCheckProcessor;
    let redis: ReturnType<typeof makeRedis>;
    let instanceModel: ReturnType<typeof makeModel>;
    let gateway: jest.Mocked<ConsoleGateway>;
    let consoleService: jest.Mocked<ConsoleService>;
    let pushService: jest.Mocked<WebPushSubService>;
    let queue: { add: jest.Mock };

    beforeEach(async () => {
        redis = makeRedis();
        instanceModel = makeModel();
        queue = { add: jest.fn().mockResolvedValue({}) };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                HealthCheckProcessor,
                { provide: REDIS, useValue: redis },
                {
                    provide: getModelToken(EaInstance.name),
                    useValue: instanceModel,
                },
                {
                    provide: ConsoleGateway,
                    useValue: { emitToRoom: jest.fn() },
                },
                {
                    provide: ConsoleService,
                    useValue: {
                        logEvent: jest.fn().mockResolvedValue(undefined),
                    },
                },
                {
                    provide: WebPushSubService,
                    useValue: {
                        sendToUsers: jest.fn().mockResolvedValue(undefined),
                    },
                },
                { provide: 'BullQueue_console-health', useValue: queue },
            ],
        }).compile();

        processor = module.get<HealthCheckProcessor>(HealthCheckProcessor);
        gateway = module.get(ConsoleGateway);
        consoleService = module.get(ConsoleService);
        pushService = module.get(WebPushSubService);
    });

    // ── process() dispatch ────────────────────────────────────────────────────

    describe('process()', () => {
        it('routes check-heartbeat to checkHeartbeat()', async () => {
            instanceModel.find.mockReturnValue({
                lean: () => ({ exec: () => Promise.resolve([]) }),
            });
            await expect(
                processor.process(makeJob('check-heartbeat')),
            ).resolves.toBeUndefined();
        });

        it('routes send-offline-alert to sendOfflineAlert()', async () => {
            await expect(
                processor.process(
                    makeJob('send-offline-alert', {
                        agentId: 'a1',
                        symbol: 'EURUSD',
                        accountLogin: '12345',
                    }),
                ),
            ).resolves.toBeUndefined();
        });

        it('routes send-kill-switch-alert to sendKillSwitchAlert()', async () => {
            await expect(
                processor.process(
                    makeJob('send-kill-switch-alert', {
                        agentId: 'a1',
                        symbol: 'EURUSD',
                        accountLogin: '12345',
                    }),
                ),
            ).resolves.toBeUndefined();
        });

        it('does not throw for unknown job names', async () => {
            await expect(
                processor.process(makeJob('unknown-job')),
            ).resolves.toBeUndefined();
        });
    });

    // ── checkHeartbeat ────────────────────────────────────────────────────────

    describe('checkHeartbeat', () => {
        const onlineInstance = {
            agentId: 'agent-1',
            symbol: 'EURUSD',
            accountLogin: '12345',
            online: true,
        };

        it('does nothing when there are no online instances', async () => {
            instanceModel.find.mockReturnValue({
                lean: () => ({ exec: () => Promise.resolve([]) }),
            });

            await processor.process(makeJob('check-heartbeat'));

            expect(instanceModel.updateOne).not.toHaveBeenCalled();
            expect(gateway.emitToRoom).not.toHaveBeenCalled();
        });

        it('marks instance offline when Redis has no cached telemetry', async () => {
            instanceModel.find.mockReturnValue({
                lean: () => ({ exec: () => Promise.resolve([onlineInstance]) }),
            });
            redis.get.mockResolvedValue(null);

            await processor.process(makeJob('check-heartbeat'));

            expect(instanceModel.updateOne).toHaveBeenCalledWith(
                { agentId: 'agent-1' },
                { $set: { online: false } },
            );
        });

        it('emits console:status with online=false when instance goes stale', async () => {
            instanceModel.find.mockReturnValue({
                lean: () => ({ exec: () => Promise.resolve([onlineInstance]) }),
            });
            redis.get.mockResolvedValue(null);

            await processor.process(makeJob('check-heartbeat'));

            expect(gateway.emitToRoom).toHaveBeenCalledWith(
                'agent:agent-1',
                'console:status',
                expect.objectContaining({ agentId: 'agent-1', online: false }),
            );
        });

        it('logs BridgeDisconnect audit event when instance goes stale', async () => {
            instanceModel.find.mockReturnValue({
                lean: () => ({ exec: () => Promise.resolve([onlineInstance]) }),
            });
            redis.get.mockResolvedValue(null);

            await processor.process(makeJob('check-heartbeat'));

            expect(consoleService.logEvent).toHaveBeenCalledWith(
                'agent-1',
                AuditEvent.BridgeDisconnect,
                expect.objectContaining({ reason: 'heartbeat_timeout' }),
            );
        });

        it('enqueues send-offline-alert when instance goes stale', async () => {
            instanceModel.find.mockReturnValue({
                lean: () => ({ exec: () => Promise.resolve([onlineInstance]) }),
            });
            redis.get.mockResolvedValue(null);

            await processor.process(makeJob('check-heartbeat'));

            expect(queue.add).toHaveBeenCalledWith(
                'send-offline-alert',
                expect.objectContaining({ agentId: 'agent-1' }),
            );
        });

        it('does NOT mark offline when telemetry is fresh', async () => {
            instanceModel.find.mockReturnValue({
                lean: () => ({ exec: () => Promise.resolve([onlineInstance]) }),
            });
            // Fresh telemetry: timestamp just 10 seconds ago
            const freshTs = Math.floor(Date.now() / 1000) - 10;
            redis.get.mockResolvedValue(JSON.stringify({ ts: freshTs }));

            await processor.process(makeJob('check-heartbeat'));

            expect(instanceModel.updateOne).not.toHaveBeenCalled();
        });

        it('marks offline when telemetry timestamp is older than 5 minutes', async () => {
            instanceModel.find.mockReturnValue({
                lean: () => ({ exec: () => Promise.resolve([onlineInstance]) }),
            });
            // Stale telemetry: 6 minutes ago
            const staleTs = Math.floor(Date.now() / 1000) - 6 * 60;
            redis.get.mockResolvedValue(JSON.stringify({ ts: staleTs }));

            await processor.process(makeJob('check-heartbeat'));

            expect(instanceModel.updateOne).toHaveBeenCalledWith(
                { agentId: 'agent-1' },
                { $set: { online: false } },
            );
        });

        it('marks offline when cached telemetry JSON is invalid', async () => {
            instanceModel.find.mockReturnValue({
                lean: () => ({ exec: () => Promise.resolve([onlineInstance]) }),
            });
            redis.get.mockResolvedValue('{broken json');

            await processor.process(makeJob('check-heartbeat'));

            expect(instanceModel.updateOne).toHaveBeenCalledWith(
                { agentId: 'agent-1' },
                { $set: { online: false } },
            );
        });
    });

    // ── sendOfflineAlert ──────────────────────────────────────────────────────

    describe('sendOfflineAlert', () => {
        it('does not send push when userId is undefined', async () => {
            await processor.process(
                makeJob('send-offline-alert', {
                    agentId: 'a1',
                    symbol: 'EURUSD',
                    accountLogin: '12345',
                    userId: undefined,
                }),
            );
            expect(pushService.sendToUsers).not.toHaveBeenCalled();
        });

        it('sends push notification when userId is provided', async () => {
            const userId = '507f1f77bcf86cd799439011';
            await processor.process(
                makeJob('send-offline-alert', {
                    agentId: 'a1',
                    symbol: 'EURUSD',
                    accountLogin: '12345',
                    userId,
                }),
            );
            expect(pushService.sendToUsers).toHaveBeenCalledWith(
                expect.any(Array),
                expect.objectContaining({ title: '⚠️ EA Offline' }),
            );
        });

        it('does not throw when push service fails', async () => {
            const userId = '507f1f77bcf86cd799439011';
            pushService.sendToUsers.mockRejectedValue(new Error('push failed'));

            await expect(
                processor.process(
                    makeJob('send-offline-alert', {
                        agentId: 'a1',
                        symbol: 'EURUSD',
                        accountLogin: '12345',
                        userId,
                    }),
                ),
            ).resolves.toBeUndefined();
        });
    });

    // ── sendKillSwitchAlert ───────────────────────────────────────────────────

    describe('sendKillSwitchAlert', () => {
        it('does not send push when userId is undefined', async () => {
            await processor.process(
                makeJob('send-kill-switch-alert', {
                    agentId: 'a1',
                    symbol: 'EURUSD',
                    accountLogin: '12345',
                    userId: undefined,
                }),
            );
            expect(pushService.sendToUsers).not.toHaveBeenCalled();
        });

        it('sends kill switch push notification when userId is provided', async () => {
            const userId = '507f1f77bcf86cd799439011';
            await processor.process(
                makeJob('send-kill-switch-alert', {
                    agentId: 'a1',
                    symbol: 'EURUSD',
                    accountLogin: '12345',
                    userId,
                }),
            );
            expect(pushService.sendToUsers).toHaveBeenCalledWith(
                expect.any(Array),
                expect.objectContaining({ title: '🛑 Kill Switch Executed' }),
            );
        });
    });
});
