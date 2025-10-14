import { registerAs } from '@nestjs/config';

function csv(env?: string): string[] {
    return (env ?? '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
}

export default registerAs('webhooks', () => ({
    // The guard expects cfg.get('webhooks.keyMap')
    keyMap: {
        retailer: csv(process.env.WEBHOOK_KEYS__retailer),
        default: csv(process.env.WEBHOOK_KEYS__default),
    },
}));
