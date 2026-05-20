import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';

import { ConsoleGateway } from './console.gateway';
import { JoseService } from '../memberships/jose.service';
import { REDIS } from '../redis/redis.constants';
import { EaInstance } from './schemas/ea-instance.schema';

interface FakeSocketData {
    userId: string | null;
    isBridge: boolean;
    agentId?: string;
    licenseKey: string | null;
    accountLogin: string | null;
}

function makeInstanceModel() {
    return {
        findOne: jest.fn().mockReturnValue({
            lean: () => ({ exec: () => Promise.resolve(null) }),
            exec: () => Promise.resolve(null),
        }),
        findOneAndUpdate: jest.fn().mockResolvedValue(null),
        updateOne: jest.fn().mockResolvedValue({}),
    };
}

function makeIoMock() {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    return { to, emit };
}

function makeClient(data: Partial<FakeSocketData>) {
    return {
        id: 'sock-test',
        data: {
            userId: null,
            isBridge: true,
            licenseKey: null,
            accountLogin: null,
            ...data,
        } as FakeSocketData,
        join: jest.fn(),
        emit: jest.fn(),
        disconnect: jest.fn(),
    };
}

describe('ConsoleGateway.onBridgeRegister', () => {
    let gateway: ConsoleGateway;
    let instanceModel: ReturnType<typeof makeInstanceModel>;
    let warnSpy: jest.SpyInstance;

    beforeEach(async () => {
        instanceModel = makeInstanceModel();
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ConsoleGateway,
                { provide: JwtService, useValue: { verifyAsync: jest.fn() } },
                { provide: JoseService, useValue: { verifyToken: jest.fn() } },
                {
                    provide: REDIS,
                    useValue: { get: jest.fn(), setex: jest.fn() },
                },
                {
                    provide: getModelToken(EaInstance.name),
                    useValue: instanceModel,
                },
            ],
        }).compile();

        gateway = module.get(ConsoleGateway);
        gateway.io = makeIoMock() as never;
        warnSpy = jest
            .spyOn(
                (gateway as unknown as { logger: { warn: jest.Mock } }).logger,
                'warn',
            )
            .mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('creates ea-instance with all required fields when JWT carries credentials', async () => {
        const client = makeClient({
            userId: 'user-1',
            licenseKey: 'EA-XYZ',
            accountLogin: '184006910',
        });

        await gateway.onBridgeRegister(client as never, {
            agentId: '184006910-XAUUSDc-1001-1002',
        });

        expect(instanceModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
        const call = instanceModel.findOneAndUpdate.mock.calls[0] as [
            Record<string, unknown>,
            { $set: Record<string, unknown> },
        ];
        expect(call[0]).toEqual({ agentId: '184006910-XAUUSDc-1001-1002' });
        expect(call[1].$set).toMatchObject({
            accountLogin: '184006910',
            licenseKey: 'EA-XYZ',
            symbol: 'XAUUSDc',
            online: true,
            userId: 'user-1',
        });
        expect(call[1].$set.lastSeenAt).toBeInstanceOf(Date);
    });

    it('skips upsert and warns when licenseKey is missing from JWT', async () => {
        const client = makeClient({
            userId: 'user-1',
            licenseKey: null,
            accountLogin: '184006910',
        });

        await gateway.onBridgeRegister(client as never, {
            agentId: '184006910-XAUUSDc-1001-1002',
        });

        expect(instanceModel.findOneAndUpdate).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledTimes(1);
        const firstCall = warnSpy.mock.calls[0] as unknown[];
        expect(firstCall[0] as string).toMatch(/missing fields/);
    });

    it('skips upsert and warns when agentId is malformed (no symbol segment)', async () => {
        const client = makeClient({
            userId: 'user-1',
            licenseKey: 'EA-XYZ',
            accountLogin: '184006910',
        });

        await gateway.onBridgeRegister(client as never, {
            agentId: 'badagentidnodash',
        });

        expect(instanceModel.findOneAndUpdate).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledTimes(1);
        const firstCall = warnSpy.mock.calls[0] as unknown[];
        expect(firstCall[0] as string).toMatch(/missing fields/);
    });
});
