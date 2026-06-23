import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';

import { ConsoleGateway } from './console.gateway';
import { EaInstance } from './schemas/ea-instance.schema';

interface FakeSocketData {
    userId: string | null;
    isBridge: boolean;
    agentId?: string;
    licenseKey: string | null;
    accountLogin: string | null;
    symbol: string | null;
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
            symbol: null,
            ...data,
        } as FakeSocketData,
        join: jest.fn(),
        emit: jest.fn(),
        disconnect: jest.fn(),
    };
}

async function buildGateway(
    instanceModel: ReturnType<typeof makeInstanceModel>,
) {
    const module: TestingModule = await Test.createTestingModule({
        providers: [
            ConsoleGateway,
            {
                provide: getModelToken(EaInstance.name),
                useValue: instanceModel,
            },
        ],
    }).compile();
    const gateway = module.get(ConsoleGateway);
    gateway.io = makeIoMock() as never;
    return gateway;
}

describe('ConsoleGateway.onBridgeRegister', () => {
    let gateway: ConsoleGateway;
    let instanceModel: ReturnType<typeof makeInstanceModel>;
    let warnSpy: jest.SpyInstance;

    beforeEach(async () => {
        instanceModel = makeInstanceModel();
        gateway = await buildGateway(instanceModel);
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

    it('creates ea-instance with all required fields when token carries credentials', async () => {
        const client = makeClient({
            userId: 'user-1',
            licenseKey: 'EA-XYZ',
            accountLogin: '184006910',
            symbol: 'XAUUSDc',
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

    it('skips upsert and warns when licenseKey is missing from token', async () => {
        const client = makeClient({
            userId: 'user-1',
            licenseKey: null,
            accountLogin: '184006910',
            symbol: 'XAUUSDc',
        });

        await gateway.onBridgeRegister(client as never, {
            agentId: '184006910-XAUUSDc-1001-1002',
        });

        expect(instanceModel.findOneAndUpdate).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledTimes(1);
        const firstCall = warnSpy.mock.calls[0] as unknown[];
        expect(firstCall[0] as string).toMatch(/missing fields/);
    });

    it('rejects browser sockets (isBridge guard on bridge:register)', async () => {
        const client = makeClient({
            userId: 'user-1',
            isBridge: false,
            licenseKey: 'EA-XYZ',
            accountLogin: '184006910',
            symbol: 'XAUUSDc',
        });

        await gateway.onBridgeRegister(client as never, {
            agentId: '184006910-XAUUSDc-1001-1002',
        });

        expect(instanceModel.findOne).not.toHaveBeenCalled();
        expect(instanceModel.findOneAndUpdate).not.toHaveBeenCalled();
    });
});

describe('ConsoleGateway bridge-only event guards', () => {
    let gateway: ConsoleGateway;
    let instanceModel: ReturnType<typeof makeInstanceModel>;

    beforeEach(async () => {
        instanceModel = makeInstanceModel();
        gateway = await buildGateway(instanceModel);
    });

    it('onBridgeTelemetry ignores browser sockets (no cache write, no DB write)', async () => {
        const client = makeClient({
            userId: 'user-1',
            isBridge: false,
            agentId: 'agent-1',
        });
        await gateway.onBridgeTelemetry(
            client as never,
            {
                agentId: 'agent-1',
                balance: 99999,
            } as never,
        );
        expect(gateway.getCachedState('agent-1')).toBeNull();
        expect(instanceModel.updateOne).not.toHaveBeenCalled();
    });

    it('onBridgeTelemetry caches telemetry for bridge sockets', async () => {
        const client = makeClient({
            userId: 'user-1',
            isBridge: true,
            agentId: 'agent-1',
        });
        const telemetry = { agentId: 'agent-1', ts: 123, balance: 1000 };
        await gateway.onBridgeTelemetry(client as never, telemetry as never);
        expect(gateway.getCachedState('agent-1')).toBe(
            JSON.stringify(telemetry),
        );
        expect(instanceModel.updateOne).toHaveBeenCalled();
    });

    it('onBridgeAck ignores browser sockets', () => {
        const client = makeClient({
            userId: 'user-1',
            isBridge: false,
            agentId: 'agent-1',
        });
        gateway.onBridgeAck(client as never, { uuid: 'fake-uuid' });
        expect(
            (gateway.io as unknown as { to: jest.Mock }).to,
        ).not.toHaveBeenCalled();
    });

    it('onBridgeStatus ignores browser sockets', async () => {
        const client = makeClient({
            userId: 'user-1',
            isBridge: false,
            agentId: 'agent-1',
        });
        await gateway.onBridgeStatus(
            client as never,
            { online: false } as never,
        );
        expect(instanceModel.updateOne).not.toHaveBeenCalled();
    });

    it('onBridgeOffline ignores browser sockets', async () => {
        const client = makeClient({
            userId: 'user-1',
            isBridge: false,
            agentId: 'agent-1',
        });
        await gateway.onBridgeOffline(client as never);
        expect(instanceModel.updateOne).not.toHaveBeenCalled();
    });
});

describe('ConsoleGateway onBridgeStatus uses client.data.agentId only', () => {
    let gateway: ConsoleGateway;
    let instanceModel: ReturnType<typeof makeInstanceModel>;

    beforeEach(async () => {
        instanceModel = makeInstanceModel();
        gateway = await buildGateway(instanceModel);
    });

    it('updates only the bridge-bound agentId', async () => {
        const client = makeClient({
            userId: 'user-1',
            isBridge: true,
            agentId: 'real-agent',
        });
        await gateway.onBridgeStatus(
            client as never,
            { online: true } as never,
        );
        expect(instanceModel.updateOne).toHaveBeenCalledWith(
            { agentId: 'real-agent' },
            expect.objectContaining({
                $set: expect.any(Object) as unknown,
            }),
        );
    });

    it('does nothing when bridge has no agentId yet', async () => {
        const client = makeClient({
            userId: 'user-1',
            isBridge: true,
            agentId: undefined,
        });
        await gateway.onBridgeStatus(
            client as never,
            { online: true } as never,
        );
        expect(instanceModel.updateOne).not.toHaveBeenCalled();
    });
});

describe('ConsoleGateway.onClientSubscribe (tight ownership)', () => {
    let gateway: ConsoleGateway;
    let instanceModel: ReturnType<typeof makeInstanceModel>;

    beforeEach(async () => {
        instanceModel = makeInstanceModel();
        gateway = await buildGateway(instanceModel);
    });

    function mockInstance(userId: string | null) {
        instanceModel.findOne.mockReturnValue({
            lean: () => ({
                exec: () => Promise.resolve({ agentId: 'agent-1', userId }),
            }),
        });
    }

    it('allows owner to subscribe', async () => {
        mockInstance('user-1');
        const client = makeClient({ userId: 'user-1', isBridge: false });
        await gateway.onClientSubscribe(client as never, {
            agentId: 'agent-1',
        });
        expect(client.join).toHaveBeenCalledWith('agent:agent-1');
        expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('rejects different user', async () => {
        mockInstance('user-OWNER');
        const client = makeClient({ userId: 'user-OTHER', isBridge: false });
        await gateway.onClientSubscribe(client as never, {
            agentId: 'agent-1',
        });
        expect(client.emit).toHaveBeenCalledWith('error', {
            message: 'forbidden',
        });
        expect(client.disconnect).toHaveBeenCalled();
    });

    it('rejects unclaimed instance (no null bypass)', async () => {
        mockInstance(null);
        const client = makeClient({ userId: 'user-1', isBridge: false });
        await gateway.onClientSubscribe(client as never, {
            agentId: 'agent-1',
        });
        expect(client.emit).toHaveBeenCalledWith('error', {
            message: 'forbidden',
        });
        expect(client.disconnect).toHaveBeenCalled();
    });

    it('rejects when instance does not exist', async () => {
        instanceModel.findOne.mockReturnValue({
            lean: () => ({ exec: () => Promise.resolve(null) }),
        });
        const client = makeClient({ userId: 'user-1', isBridge: false });
        await gateway.onClientSubscribe(client as never, {
            agentId: 'agent-1',
        });
        expect(client.disconnect).toHaveBeenCalled();
    });
});
