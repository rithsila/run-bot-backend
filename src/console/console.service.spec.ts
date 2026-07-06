import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
    NotFoundException,
    BadRequestException,
    ForbiddenException,
} from '@nestjs/common';

jest.mock('./console.gateway');

import { ConsoleService } from './console.service';
import { ConsoleGateway } from './console.gateway';
import { EaInstance } from './schemas/ea-instance.schema';
import { EaAuditLog, AuditEvent } from './schemas/ea-audit-log.schema';
import { EaPnlPoint } from './schemas/ea-pnl-point.schema';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeModel(overrides: Record<string, jest.Mock> = {}) {
    return {
        find: jest.fn().mockReturnValue({
            lean: () => ({ exec: () => Promise.resolve([]) }),
        }),
        findOne: jest.fn().mockReturnValue({
            lean: () => ({ exec: () => Promise.resolve(null) }),
        }),
        findOneAndUpdate: jest.fn().mockReturnValue({
            lean: () => ({ exec: () => Promise.resolve(null) }),
        }),
        findByIdAndDelete: jest.fn().mockReturnValue({
            lean: () => ({ exec: () => Promise.resolve(null) }),
        }),
        create: jest.fn().mockResolvedValue({}),
        updateOne: jest.fn().mockResolvedValue({}),
        ...overrides,
    };
}

function makeGateway() {
    return {
        sendCommandToBridge: jest.fn(),
        sendCommandToBridgeWithAck: jest.fn(),
        emitToRoom: jest.fn(),
        getCachedState: jest.fn().mockReturnValue(null),
    };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ConsoleService', () => {
    let service: ConsoleService;
    let instanceModel: ReturnType<typeof makeModel>;
    let auditModel: ReturnType<typeof makeModel>;
    let pnlModel: ReturnType<typeof makeModel>;
    let gateway: ReturnType<typeof makeGateway>;

    beforeEach(async () => {
        instanceModel = makeModel();
        auditModel = makeModel();
        pnlModel = makeModel();
        gateway = makeGateway();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ConsoleService,
                {
                    provide: getModelToken(EaInstance.name),
                    useValue: instanceModel,
                },
                {
                    provide: getModelToken(EaAuditLog.name),
                    useValue: auditModel,
                },
                {
                    provide: getModelToken(EaPnlPoint.name),
                    useValue: pnlModel,
                },
                { provide: ConsoleGateway, useValue: gateway },
            ],
        }).compile();

        service = module.get<ConsoleService>(ConsoleService);
    });

    // ── getLatestState ────────────────────────────────────────────────────────

    describe('getLatestState', () => {
        function mockOwned(userId: string | null) {
            instanceModel.findOne.mockReturnValue({
                lean: () => ({
                    exec: () => Promise.resolve({ agentId: 'agent-1', userId }),
                }),
            });
        }

        it('returns null when cache has no key', async () => {
            mockOwned('user-1');
            gateway.getCachedState.mockReturnValue(null);
            const result = await service.getLatestState('agent-1', 'user-1');
            expect(result).toBeNull();
        });

        it('returns parsed telemetry when cache has valid JSON', async () => {
            mockOwned('user-1');
            const telemetry = {
                agentId: 'agent-1',
                ts: 1234567890,
                balance: 1000,
            };
            gateway.getCachedState.mockReturnValue(JSON.stringify(telemetry));
            const result = await service.getLatestState('agent-1', 'user-1');
            expect(result).toEqual(telemetry);
        });

        it('returns null when cache has invalid JSON', async () => {
            mockOwned('user-1');
            gateway.getCachedState.mockReturnValue('{invalid json');
            const result = await service.getLatestState('agent-1', 'user-1');
            expect(result).toBeNull();
        });

        it('throws ForbiddenException when userId does not match (CR-1)', async () => {
            mockOwned('user-OWNER');
            await expect(
                service.getLatestState('agent-1', 'user-OTHER'),
            ).rejects.toThrow(ForbiddenException);
            expect(gateway.getCachedState).not.toHaveBeenCalled();
        });

        it('throws ForbiddenException when instance is unclaimed (CR-2)', async () => {
            mockOwned(null);
            await expect(
                service.getLatestState('agent-1', 'user-1'),
            ).rejects.toThrow(ForbiddenException);
        });
    });

    // ── getInstanceStatus ─────────────────────────────────────────────────────

    describe('getInstanceStatus', () => {
        it('throws NotFoundException when instance does not exist', async () => {
            instanceModel.findOne.mockReturnValue({
                lean: () => ({ exec: () => Promise.resolve(null) }),
            });
            await expect(
                service.getInstanceStatus('missing-agent'),
            ).rejects.toThrow(NotFoundException);
        });

        it('returns online and lastSeenAt when instance exists', async () => {
            const lastSeenAt = new Date();
            instanceModel.findOne.mockReturnValue({
                lean: () => ({
                    exec: () => Promise.resolve({ online: true, lastSeenAt }),
                }),
            });
            const result = await service.getInstanceStatus('agent-1');
            expect(result).toEqual({ online: true, lastSeenAt });
        });
    });

    // ── sendKillSwitch ────────────────────────────────────────────────────────

    describe('sendKillSwitch', () => {
        it('throws NotFoundException when EA instance is not found', async () => {
            instanceModel.findOne.mockReturnValue({
                lean: () => ({ exec: () => Promise.resolve(null) }),
            });
            await expect(
                service.sendKillSwitch('agent-1', 'user-1'),
            ).rejects.toThrow(NotFoundException);
        });

        it('throws NotFoundException when EA is offline', async () => {
            instanceModel.findOne.mockReturnValue({
                lean: () => ({
                    exec: () =>
                        Promise.resolve({
                            agentId: 'agent-1',
                            userId: 'user-1',
                            online: false,
                        }),
                }),
            });
            await expect(
                service.sendKillSwitch('agent-1', 'user-1'),
            ).rejects.toThrow(NotFoundException);
        });

        it('calls gateway.sendCommandToBridge with KILL_SWITCH verb', async () => {
            instanceModel.findOne.mockReturnValue({
                lean: () => ({
                    exec: () =>
                        Promise.resolve({
                            agentId: 'agent-1',
                            userId: 'user-1',
                            online: true,
                        }),
                }),
            });
            auditModel.create.mockResolvedValue({});

            const result = await service.sendKillSwitch('agent-1', 'user-1');

            expect(gateway.sendCommandToBridge).toHaveBeenCalledWith(
                'agent-1',
                expect.any(String),
                'KILL_SWITCH',
            );
            expect(result).toHaveProperty('commandId');
            expect(typeof result.commandId).toBe('string');
        });

        it('logs an audit event after sending kill switch', async () => {
            instanceModel.findOne.mockReturnValue({
                lean: () => ({
                    exec: () =>
                        Promise.resolve({
                            agentId: 'agent-1',
                            userId: 'user-1',
                            online: true,
                        }),
                }),
            });
            auditModel.create.mockResolvedValue({});

            await service.sendKillSwitch('agent-1', 'user-1');

            expect(auditModel.create).toHaveBeenCalledWith(
                expect.objectContaining({ event: AuditEvent.KillSwitch }),
            );
        });
    });

    // ── sendKillReset ─────────────────────────────────────────────────────────

    describe('sendKillReset', () => {
        beforeEach(() => {
            instanceModel.findOne.mockReturnValue({
                lean: () => ({
                    exec: () =>
                        Promise.resolve({
                            agentId: 'agent-1',
                            userId: 'user-1',
                            online: true,
                        }),
                }),
            });
            auditModel.create.mockResolvedValue({});
        });

        it('sends KILL_RESET verb to bridge', async () => {
            await service.sendKillReset('agent-1', 'user-1');
            expect(gateway.sendCommandToBridge).toHaveBeenCalledWith(
                'agent-1',
                expect.any(String),
                'KILL_RESET',
            );
        });

        it('logs KillReset audit event', async () => {
            await service.sendKillReset('agent-1', 'user-1');
            expect(auditModel.create).toHaveBeenCalledWith(
                expect.objectContaining({ event: AuditEvent.KillReset }),
            );
        });

        it('throws NotFoundException when EA is offline', async () => {
            instanceModel.findOne.mockReturnValue({
                lean: () => ({
                    exec: () =>
                        Promise.resolve({
                            agentId: 'agent-1',
                            userId: 'user-1',
                            online: false,
                        }),
                }),
            });
            await expect(
                service.sendKillReset('agent-1', 'user-1'),
            ).rejects.toThrow(NotFoundException);
        });
    });

    // ── sendMasterEnable ──────────────────────────────────────────────────────

    describe('sendMasterEnable', () => {
        beforeEach(() => {
            instanceModel.findOne.mockReturnValue({
                lean: () => ({
                    exec: () =>
                        Promise.resolve({
                            agentId: 'agent-1',
                            userId: 'user-1',
                            online: true,
                        }),
                }),
            });
            auditModel.create.mockResolvedValue({});
        });

        it('sends MASTER_ENABLE with value "1" when enabled=true', async () => {
            await service.sendMasterEnable('agent-1', true, 'user-1');
            expect(gateway.sendCommandToBridge).toHaveBeenCalledWith(
                'agent-1',
                expect.any(String),
                'MASTER_ENABLE',
                '1',
            );
        });

        it('sends MASTER_ENABLE with value "0" when enabled=false', async () => {
            await service.sendMasterEnable('agent-1', false, 'user-1');
            expect(gateway.sendCommandToBridge).toHaveBeenCalledWith(
                'agent-1',
                expect.any(String),
                'MASTER_ENABLE',
                '0',
            );
        });
    });

    // ── sendCloseBuy / sendCloseSell ──────────────────────────────────────────

    describe('sendCloseBuy', () => {
        beforeEach(() => {
            instanceModel.findOne.mockReturnValue({
                lean: () => ({
                    exec: () =>
                        Promise.resolve({
                            agentId: 'agent-1',
                            userId: 'user-1',
                            online: true,
                        }),
                }),
            });
            auditModel.create.mockResolvedValue({});
        });

        it('sends CLOSE_BUY verb to bridge', async () => {
            await service.sendCloseBuy('agent-1', 'user-1');
            expect(gateway.sendCommandToBridge).toHaveBeenCalledWith(
                'agent-1',
                expect.any(String),
                'CLOSE_BUY',
            );
        });

        it('logs CloseBuy audit event', async () => {
            await service.sendCloseBuy('agent-1', 'user-1');
            expect(auditModel.create).toHaveBeenCalledWith(
                expect.objectContaining({ event: AuditEvent.CloseBuy }),
            );
        });

        it('returns a commandId', async () => {
            const result = await service.sendCloseBuy('agent-1', 'user-1');
            expect(result).toHaveProperty('commandId');
            expect(typeof result.commandId).toBe('string');
        });

        it('throws NotFoundException when EA is offline', async () => {
            instanceModel.findOne.mockReturnValue({
                lean: () => ({
                    exec: () =>
                        Promise.resolve({
                            agentId: 'agent-1',
                            userId: 'user-1',
                            online: false,
                        }),
                }),
            });
            await expect(
                service.sendCloseBuy('agent-1', 'user-1'),
            ).rejects.toThrow(NotFoundException);
        });

        it('throws ForbiddenException when userId does not match', async () => {
            instanceModel.findOne.mockReturnValue({
                lean: () => ({
                    exec: () =>
                        Promise.resolve({
                            agentId: 'agent-1',
                            userId: 'user-OWNER',
                            online: true,
                        }),
                }),
            });
            await expect(
                service.sendCloseBuy('agent-1', 'user-OTHER'),
            ).rejects.toThrow(ForbiddenException);
            expect(gateway.sendCommandToBridge).not.toHaveBeenCalled();
        });
    });

    describe('sendCloseSell', () => {
        beforeEach(() => {
            instanceModel.findOne.mockReturnValue({
                lean: () => ({
                    exec: () =>
                        Promise.resolve({
                            agentId: 'agent-1',
                            userId: 'user-1',
                            online: true,
                        }),
                }),
            });
            auditModel.create.mockResolvedValue({});
        });

        it('sends CLOSE_SELL verb to bridge', async () => {
            await service.sendCloseSell('agent-1', 'user-1');
            expect(gateway.sendCommandToBridge).toHaveBeenCalledWith(
                'agent-1',
                expect.any(String),
                'CLOSE_SELL',
            );
        });

        it('logs CloseSell audit event', async () => {
            await service.sendCloseSell('agent-1', 'user-1');
            expect(auditModel.create).toHaveBeenCalledWith(
                expect.objectContaining({ event: AuditEvent.CloseSell }),
            );
        });

        it('throws NotFoundException when EA is offline', async () => {
            instanceModel.findOne.mockReturnValue({
                lean: () => ({
                    exec: () =>
                        Promise.resolve({
                            agentId: 'agent-1',
                            userId: 'user-1',
                            online: false,
                        }),
                }),
            });
            await expect(
                service.sendCloseSell('agent-1', 'user-1'),
            ).rejects.toThrow(NotFoundException);
        });

        it('throws ForbiddenException when userId does not match', async () => {
            instanceModel.findOne.mockReturnValue({
                lean: () => ({
                    exec: () =>
                        Promise.resolve({
                            agentId: 'agent-1',
                            userId: 'user-OWNER',
                            online: true,
                        }),
                }),
            });
            await expect(
                service.sendCloseSell('agent-1', 'user-OTHER'),
            ).rejects.toThrow(ForbiddenException);
            expect(gateway.sendCommandToBridge).not.toHaveBeenCalled();
        });
    });

    // ── pushSettings ──────────────────────────────────────────────────────────

    describe('pushSettings', () => {
        beforeEach(() => {
            instanceModel.findOne.mockReturnValue({
                lean: () => ({
                    exec: () =>
                        Promise.resolve({
                            agentId: 'agent-1',
                            userId: 'user-1',
                            online: true,
                        }),
                }),
            });
            auditModel.create.mockResolvedValue({});
        });

        it('throws BadRequestException for unknown settings keys', async () => {
            await expect(
                service.pushSettings('agent-1', { UnknownKey: 99 }, 'user-1'),
            ).rejects.toThrow(BadRequestException);
        });

        it('rejects keys that were removed during RB-54 reconciliation', async () => {
            // These were in the old whitelist but are NOT real EA params.
            for (const key of [
                'MaxTradesPerSide',
                'Slippage',
                'TradeComment',
            ]) {
                await expect(
                    service.pushSettings('agent-1', { [key]: 1 }, 'user-1'),
                ).rejects.toThrow(BadRequestException);
            }
        });

        it('rejects restart-required keys live (indicator handles / identity)', async () => {
            for (const key of [
                'ATRPeriod',
                'BBPeriod',
                'p_G03',
                'BasketTP_ATRSmoothPeriod',
                'BuyMagicNumber',
            ]) {
                await expect(
                    service.pushSettings('agent-1', { [key]: 5 }, 'user-1'),
                ).rejects.toThrow(/Restart-required/);
            }
        });

        it('accepts reconciled live keys (real EA params)', async () => {
            const settings = {
                EnableBuy: false,
                p_G06: 75,
                BasketTP_FixedPips: 25,
                AsiaSessionLocal: '06:30-04:00',
                DailyProfitMode: 1,
            };
            await expect(
                service.pushSettings('agent-1', settings, 'user-1'),
            ).resolves.toHaveProperty('commandId');
        });

        it('sends SETTINGS command with base64-encoded JSON payload', async () => {
            const settings = { StartingLots: 0.02, MaxTrades: 5 };
            await service.pushSettings('agent-1', settings, 'user-1');

            expect(gateway.sendCommandToBridge).toHaveBeenCalledWith(
                'agent-1',
                expect.any(String),
                'SETTINGS',
                Buffer.from(JSON.stringify(settings)).toString('base64'),
            );
        });

        it('returns a commandId', async () => {
            const result = await service.pushSettings(
                'agent-1',
                { StartingLots: 0.01 },
                'user-1',
            );
            expect(result).toHaveProperty('commandId');
            expect(typeof result.commandId).toBe('string');
        });

        it('persists currentSettings on the instance document', async () => {
            const settings = { StartingLots: 0.03, MaxTrades: 5 };
            await service.pushSettings('agent-1', settings, 'user-1');

            expect(instanceModel.updateOne).toHaveBeenCalledWith(
                { agentId: 'agent-1' },
                { $set: { currentSettings: settings } },
            );
        });
    });

    // ── getCurrentSettings ────────────────────────────────────────────────────

    describe('getCurrentSettings', () => {
        it('returns persisted currentSettings when present', async () => {
            instanceModel.findOne.mockReturnValue({
                lean: () => ({
                    exec: () =>
                        Promise.resolve({
                            agentId: 'agent-1',
                            userId: 'user-1',
                            currentSettings: { StartingLots: 0.03 },
                        }),
                }),
            });
            const result = await service.getCurrentSettings(
                'agent-1',
                'user-1',
            );
            expect(result).toEqual({ StartingLots: 0.03 });
        });

        it('returns null when instance has no currentSettings', async () => {
            instanceModel.findOne.mockReturnValue({
                lean: () => ({
                    exec: () =>
                        Promise.resolve({
                            agentId: 'agent-1',
                            userId: 'user-1',
                            currentSettings: null,
                        }),
                }),
            });
            const result = await service.getCurrentSettings(
                'agent-1',
                'user-1',
            );
            expect(result).toBeNull();
        });

        it('throws NotFoundException when instance does not exist', async () => {
            instanceModel.findOne.mockReturnValue({
                lean: () => ({ exec: () => Promise.resolve(null) }),
            });
            await expect(
                service.getCurrentSettings('missing', 'user-1'),
            ).rejects.toThrow(NotFoundException);
        });

        it('throws ForbiddenException when userId does not match (CR-1)', async () => {
            instanceModel.findOne.mockReturnValue({
                lean: () => ({
                    exec: () =>
                        Promise.resolve({
                            agentId: 'agent-1',
                            userId: 'user-OWNER',
                            currentSettings: { secret: 'data' },
                        }),
                }),
            });
            await expect(
                service.getCurrentSettings('agent-1', 'user-OTHER'),
            ).rejects.toThrow(ForbiddenException);
        });
    });

    // ── getAuditLog ───────────────────────────────────────────────────────────

    describe('getAuditLog', () => {
        it('limits results to 200 even when a higher limit is requested', async () => {
            const limitSpy = jest.fn().mockReturnValue({
                lean: () => ({ exec: () => Promise.resolve([]) }),
            });
            const sortSpy = jest.fn().mockReturnValue({ limit: limitSpy });
            auditModel.find = jest.fn().mockReturnValue({ sort: sortSpy });

            // ownership check: instance owned by user-1, caller is user-1
            instanceModel.findOne.mockReturnValue({
                lean: () => ({
                    exec: () =>
                        Promise.resolve({
                            agentId: 'agent-1',
                            userId: 'user-1',
                        }),
                }),
            });

            await service.getAuditLog('agent-1', 'user-1', 500);

            expect(limitSpy).toHaveBeenCalledWith(200);
        });

        it('sorts results by createdAt descending', async () => {
            const limitSpy = jest.fn().mockReturnValue({
                lean: () => ({ exec: () => Promise.resolve([]) }),
            });
            const sortSpy = jest.fn().mockReturnValue({ limit: limitSpy });
            auditModel.find = jest.fn().mockReturnValue({ sort: sortSpy });

            instanceModel.findOne.mockReturnValue({
                lean: () => ({
                    exec: () =>
                        Promise.resolve({
                            agentId: 'agent-1',
                            userId: 'user-1',
                        }),
                }),
            });

            await service.getAuditLog('agent-1', 'user-1', 10);

            expect(sortSpy).toHaveBeenCalledWith({ createdAt: -1 });
        });
    });

    // ── PnL history (RB-60) ────────────────────────────────────────────────────

    describe('recordPnlPoint', () => {
        const telemetry = {
            agentId: 'agent-1',
            ts: 1_700_000,
            account: { equity: 1050, balance: 1000, dailyPnl: 12 },
            positions: { totalPnl: 50 },
        };

        it('inserts a point from cached telemetry', async () => {
            gateway.getCachedState.mockReturnValue(JSON.stringify(telemetry));
            const ok = await service.recordPnlPoint('agent-1');
            expect(ok).toBe(true);
            expect(pnlModel.create).toHaveBeenCalledWith({
                agentId: 'agent-1',
                ts: 1_700_000 * 1000,
                equity: 1050,
                balance: 1000,
                totalPnl: 50,
                dailyPnl: 12,
            });
        });

        it('does nothing when there is no cached telemetry', async () => {
            gateway.getCachedState.mockReturnValue(null);
            const ok = await service.recordPnlPoint('agent-1');
            expect(ok).toBe(false);
            expect(pnlModel.create).not.toHaveBeenCalled();
        });

        it('does nothing when cached telemetry is invalid JSON', async () => {
            gateway.getCachedState.mockReturnValue('{not json');
            const ok = await service.recordPnlPoint('agent-1');
            expect(ok).toBe(false);
            expect(pnlModel.create).not.toHaveBeenCalled();
        });

        it('does nothing when account telemetry is missing', async () => {
            gateway.getCachedState.mockReturnValue(
                JSON.stringify({ agentId: 'agent-1', ts: 1 }),
            );
            const ok = await service.recordPnlPoint('agent-1');
            expect(ok).toBe(false);
            expect(pnlModel.create).not.toHaveBeenCalled();
        });
    });

    describe('getPnlHistory', () => {
        function mockOwnedBy(userId: string | null) {
            instanceModel.findOne.mockReturnValue({
                lean: () => ({
                    exec: () => Promise.resolve({ agentId: 'agent-1', userId }),
                }),
            });
        }

        it('returns points sorted by ts ascending, capped at the limit', async () => {
            mockOwnedBy('user-1');
            const points = [{ ts: 1 }, { ts: 2 }];
            const limitSpy = jest.fn().mockReturnValue({
                lean: () => ({ exec: () => Promise.resolve(points) }),
            });
            const sortSpy = jest.fn().mockReturnValue({ limit: limitSpy });
            pnlModel.find = jest.fn().mockReturnValue({ sort: sortSpy });

            const result = await service.getPnlHistory(
                'agent-1',
                'user-1',
                500,
            );

            expect(pnlModel.find).toHaveBeenCalledWith({ agentId: 'agent-1' });
            expect(sortSpy).toHaveBeenCalledWith({ ts: 1 });
            expect(limitSpy).toHaveBeenCalledWith(500);
            expect(result).toEqual(points);
        });

        it('caps the limit at 2000 even when a higher limit is requested', async () => {
            mockOwnedBy('user-1');
            const limitSpy = jest.fn().mockReturnValue({
                lean: () => ({ exec: () => Promise.resolve([]) }),
            });
            const sortSpy = jest.fn().mockReturnValue({ limit: limitSpy });
            pnlModel.find = jest.fn().mockReturnValue({ sort: sortSpy });

            await service.getPnlHistory('agent-1', 'user-1', 99999);

            expect(limitSpy).toHaveBeenCalledWith(2000);
        });

        it('throws ForbiddenException when userId does not match', async () => {
            mockOwnedBy('user-OWNER');
            await expect(
                service.getPnlHistory('agent-1', 'user-OTHER', 100),
            ).rejects.toThrow(ForbiddenException);
        });
    });

    describe('getPnlDailySummary', () => {
        function mockOwnedBy(userId: string | null) {
            instanceModel.findOne.mockReturnValue({
                lean: () => ({
                    exec: () => Promise.resolve({ agentId: 'agent-1', userId }),
                }),
            });
        }

        it('performs aggregation with matched agentId and dates', async () => {
            mockOwnedBy('user-1');
            const mockDailySummary = [{ date: '2026-07-01', dailyPnl: 10, balance: 1010, equity: 1010 }];
            
            const execSpy = jest.fn().mockResolvedValue(mockDailySummary);
            const aggregateSpy = jest.fn().mockReturnValue({ exec: execSpy });
            pnlModel.aggregate = aggregateSpy;

            const result = await service.getPnlDailySummary(
                'agent-1',
                'user-1',
                '2026-07-01',
                '2026-07-31',
            );

            expect(result).toEqual(mockDailySummary);
            expect(aggregateSpy).toHaveBeenCalledWith(expect.arrayContaining([
                {
                    $match: {
                        agentId: 'agent-1',
                        ts: {
                            $gte: Date.parse('2026-07-01T00:00:00.000Z'),
                            $lte: Date.parse('2026-07-31T23:59:59.999Z'),
                        },
                    },
                },
            ]));
        });

        it('performs aggregation without date filters when start/end are missing', async () => {
            mockOwnedBy('user-1');
            const mockDailySummary = [{ date: '2026-07-01', dailyPnl: 10, balance: 1010, equity: 1010 }];
            
            const execSpy = jest.fn().mockResolvedValue(mockDailySummary);
            const aggregateSpy = jest.fn().mockReturnValue({ exec: execSpy });
            pnlModel.aggregate = aggregateSpy;

            const result = await service.getPnlDailySummary(
                'agent-1',
                'user-1',
            );

            expect(result).toEqual(mockDailySummary);
            expect(aggregateSpy).toHaveBeenCalledWith(expect.arrayContaining([
                {
                    $match: {
                        agentId: 'agent-1',
                    },
                },
            ]));
        });

        it('throws ForbiddenException when user ownership check fails', async () => {
            mockOwnedBy('user-OWNER');
            await expect(
                service.getPnlDailySummary('agent-1', 'user-OTHER'),
            ).rejects.toThrow(ForbiddenException);
        });
    });

    // ── Ownership enforcement ─────────────────────────────────────────────────

    describe('ownership enforcement', () => {
        const AGENT_A = 'agent-A';
        const USER_A = 'user-A';
        const USER_B = 'user-B';

        function mockInstanceOwnedBy(userId: string, online = true) {
            instanceModel.findOne.mockReturnValue({
                lean: () => ({
                    exec: () =>
                        Promise.resolve({ agentId: AGENT_A, userId, online }),
                }),
            });
        }

        it('getAllInstances filters by userId', async () => {
            instanceModel.find.mockReturnValue({
                lean: () => ({ exec: () => Promise.resolve([]) }),
            });
            await service.getAllInstances(USER_A);
            expect(instanceModel.find).toHaveBeenCalledWith({ userId: USER_A });
        });

        it('sendKillSwitch throws ForbiddenException when userId does not match', async () => {
            mockInstanceOwnedBy(USER_B);
            await expect(
                service.sendKillSwitch(AGENT_A, USER_A),
            ).rejects.toThrow(ForbiddenException);
            expect(gateway.sendCommandToBridge).not.toHaveBeenCalled();
        });

        it('sendKillReset throws ForbiddenException when userId does not match', async () => {
            mockInstanceOwnedBy(USER_B);
            await expect(
                service.sendKillReset(AGENT_A, USER_A),
            ).rejects.toThrow(ForbiddenException);
        });

        it('sendMasterEnable throws ForbiddenException when userId does not match', async () => {
            mockInstanceOwnedBy(USER_B);
            await expect(
                service.sendMasterEnable(AGENT_A, true, USER_A),
            ).rejects.toThrow(ForbiddenException);
        });

        it('pushSettings throws ForbiddenException when userId does not match', async () => {
            mockInstanceOwnedBy(USER_B);
            await expect(
                service.pushSettings(AGENT_A, { StartingLots: 0.01 }, USER_A),
            ).rejects.toThrow(ForbiddenException);
        });

        it('getAuditLog throws ForbiddenException when userId does not match', async () => {
            mockInstanceOwnedBy(USER_B);
            await expect(
                service.getAuditLog(AGENT_A, USER_A, 10),
            ).rejects.toThrow(ForbiddenException);
        });

        it('sendKillSwitch succeeds when userId matches', async () => {
            mockInstanceOwnedBy(USER_A, true);
            auditModel.create.mockResolvedValue({});
            const result = await service.sendKillSwitch(AGENT_A, USER_A);
            expect(result).toHaveProperty('commandId');
        });

        it('rejects unclaimed instances (CR-2: no null-userId bypass)', async () => {
            mockInstanceOwnedBy(null as unknown as string, true);
            await expect(
                service.sendKillSwitch(AGENT_A, USER_A),
            ).rejects.toThrow(ForbiddenException);
            expect(gateway.sendCommandToBridge).not.toHaveBeenCalled();
        });
    });
});
