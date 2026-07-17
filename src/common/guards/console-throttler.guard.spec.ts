import { ConsoleThrottlerGuard } from './console-throttler.guard';

describe('ConsoleThrottlerGuard tracker (v2)', () => {
    const guard = Object.create(
        ConsoleThrottlerGuard.prototype,
    ) as ConsoleThrottlerGuard;
    const call = (req: any) => (guard as any).getTracker(req);

    it('same token, different agents → different buckets', async () => {
        const base = { headers: { authorization: 'Bearer tok-abc' } };
        const a = await call({ ...base, params: { agentId: 'A-1' } });
        const b = await call({ ...base, params: { agentId: 'B-2' } });
        expect(a).not.toBe(b);
        expect(a).toContain('A-1');
    });

    it('different tokens, same agent → different buckets', async () => {
        const a = await call({
            headers: { authorization: 'Bearer tok-1' },
            params: { agentId: 'A-1' },
        });
        const b = await call({
            headers: { authorization: 'Bearer tok-2' },
            params: { agentId: 'A-1' },
        });
        expect(a).not.toBe(b);
    });

    it('no bearer → falls back to ip|device tracker', async () => {
        const t = await call({
            headers: {},
            params: {},
            ip: '1.2.3.4',
            socket: { remoteAddress: '1.2.3.4' },
        });
        expect(t).toContain('1.2.3.4');
    });
});
