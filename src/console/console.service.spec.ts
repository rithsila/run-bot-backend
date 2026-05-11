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
import { REDIS } from '../redis/redis.constants';
import { EaInstance } from './schemas/ea-instance.schema';
import { EaAuditLog, AuditEvent } from './schemas/ea-audit-log.schema';

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

function makeRedis(overrides: Record<string, jest.Mock> = {}) {
    return {
        get: jest.fn().mockResolvedValue(null),
        setex: jest.fn().mockResolvedValue('OK'),
        ...overrides,
    };
}

function makeGateway() {
    return {
        sendCommandToBridge: jest.fn(),
        sendCommandToBridgeWithAck: jest.fn(),
        emitToRoom: jest.fn(),
    };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ConsoleService', () => {
    let service: ConsoleService;
    let redis: ReturnType<typeof makeRedis>;
    let instanceModel: ReturnType<typeof makeModel>;
    let auditModel: ReturnType<typeof makeModel>;
    let gateway: ReturnType<typeof makeGateway>;

    beforeEach(async () => {
        redis = makeRedis();
        instanceModel = makeModel();
        auditModel = makeModel();
        gateway = makeGateway();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ConsoleService,
                { provide: REDIS, useValue: redis },
                {
                    provide: getModelToken(EaInstance.name),
                    useValue: instanceModel,
                },
                {
                    provide: getModelToken(EaAuditLog.name),
                    useValue: auditModel,
                },
                { provide: ConsoleGateway, useValue: gateway },
            ],
        }).compile();

        service = module.get<ConsoleService>(ConsoleService);
    });

    // ── getLatestState ────────────────────────────────────────────────────────

    describe('getLatestState', () => {
        it('returns null when Redis has no key', async () => {
            redis.get.mockResolvedValue(null);
            const result = await service.getLatestState('agent-1');
            expect(result).toBeNull();
        });

        it('returns parsed telemetry when Redis has valid JSON', async () => {
            const telemetry = {
                agentId: 'agent-1',
                ts: 1234567890,
                balance: 1000,
            };
            redis.get.mockResolvedValue(JSON.stringify(telemetry));
            const result = await service.getLatestState('agent-1');
            expect(result).toEqual(telemetry);
        });

        it('returns null when Redis has invalid JSON', async () => {
            redis.get.mockResolvedValue('{invalid json');
            const result = await service.getLatestState('agent-1');
            expect(result).toBeNull();
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
                        Promise.resolve({ agentId: 'agent-1', online: false }),
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
                        Promise.resolve({ agentId: 'agent-1', online: true }),
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
                        Promise.resolve({ agentId: 'agent-1', online: true }),
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
                        Promise.resolve({ agentId: 'agent-1', online: true }),
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
                        Promise.resolve({ agentId: 'agent-1', online: false }),
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
                        Promise.resolve({ agentId: 'agent-1', online: true }),
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

    // ── pushSettings ──────────────────────────────────────────────────────────

    describe('pushSettings', () => {
        beforeEach(() => {
            instanceModel.findOne.mockReturnValue({
                lean: () => ({
                    exec: () =>
                        Promise.resolve({ agentId: 'agent-1', online: true }),
                }),
            });
            auditModel.create.mockResolvedValue({});
        });

        it('throws BadRequestException for unknown settings keys', async () => {
            await expect(
                service.pushSettings('agent-1', { UnknownKey: 99 }, 'user-1'),
            ).rejects.toThrow(BadRequestException);
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
                            currentSettings: { StartingLots: 0.03 },
                        }),
                }),
            });
            const result = await service.getCurrentSettings('agent-1');
            expect(result).toEqual({ StartingLots: 0.03 });
        });

        it('returns null when instance has no currentSettings', async () => {
            instanceModel.findOne.mockReturnValue({
                lean: () => ({
                    exec: () =>
                        Promise.resolve({
                            agentId: 'agent-1',
                            currentSettings: null,
                        }),
                }),
            });
            const result = await service.getCurrentSettings('agent-1');
            expect(result).toBeNull();
        });

        it('throws NotFoundException when instance does not exist', async () => {
            instanceModel.findOne.mockReturnValue({
                lean: () => ({ exec: () => Promise.resolve(null) }),
            });
            await expect(service.getCurrentSettings('missing')).rejects.toThrow(
                NotFoundException,
            );
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

            // ownership check: instance has no userId so passes
            instanceModel.findOne.mockReturnValue({
                lean: () => ({
                    exec: () =>
                        Promise.resolve({ agentId: 'agent-1', userId: null }),
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
                        Promise.resolve({ agentId: 'agent-1', userId: null }),
                }),
            });

            await service.getAuditLog('agent-1', 'user-1', 10);

            expect(sortSpy).toHaveBeenCalledWith({ createdAt: -1 });
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

        it('instance with null userId allows any caller (migration compat)', async () => {
            mockInstanceOwnedBy(null as unknown as string, true);
            auditModel.create.mockResolvedValue({});
            const result = await service.sendKillSwitch(AGENT_A, USER_A);
            expect(result).toHaveProperty('commandId');
        });
    });
});
