// Usage: node test-socket-client.js <your-user-jwt>
const { io } = require('socket.io-client');

const JWT = process.argv[2];
if (!JWT) {
    console.error('Usage: node test-socket-client.js <your-user-jwt>');
    process.exit(1);
}

const AGENT_ID = process.argv[3] ?? '99999999-XAUUSDc-1001-1002';

const socket = io('http://localhost:4000/console', {
    auth: { token: JWT },
});

socket.on('connect', () => {
    console.log('[OK] Connected:', socket.id);
    socket.emit('client:subscribe', { agentId: AGENT_ID });
    console.log(`[OK] Subscribed to agentId=${AGENT_ID}`);
});

socket.on('console:hydrate', (d) => {
    console.log('[HYDRATE] Initial telemetry snapshot:');
    console.log(JSON.stringify(d, null, 2));
});

socket.on('console:telemetry', (d) => {
    console.log(`[TELEMETRY] ts=${d.ts} statusCode=${d.statusCode}`);
});

socket.on('console:status', (d) => {
    console.log('[STATUS]', JSON.stringify(d));
});

socket.on('connect_error', (e) => {
    console.error('[ERROR] Connect error:', e.message);
});

socket.on('disconnect', (reason) => {
    console.log('[DISCONNECT]', reason);
});
