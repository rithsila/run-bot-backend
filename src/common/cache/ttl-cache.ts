/**
 * Minimal in-process key/value cache with per-entry TTL.
 *
 * Replaces the Redis telemetry cache (`ea:state:{agentId}`) for the slimmed,
 * single-instance bhub-api. Values are stored as strings (JSON) to mirror the
 * previous Redis `setex`/`get` semantics. Expired entries are evicted lazily on
 * read and proactively by a periodic sweep.
 */
export class TtlCache {
    private readonly store = new Map<
        string,
        { value: string; expiresAt: number }
    >();
    private readonly sweepTimer: NodeJS.Timeout;

    constructor(sweepIntervalMs = 60_000) {
        this.sweepTimer = setInterval(() => this.sweep(), sweepIntervalMs);
        // Do not keep the event loop alive solely for the sweep.
        this.sweepTimer.unref?.();
    }

    /** Store a value with a TTL in seconds (mirrors Redis SETEX). */
    setex(key: string, ttlSeconds: number, value: string): void {
        this.store.set(key, {
            value,
            expiresAt: Date.now() + ttlSeconds * 1000,
        });
    }

    /** Get a value or null when missing/expired (mirrors Redis GET). */
    get(key: string): string | null {
        const entry = this.store.get(key);
        if (!entry) return null;
        if (entry.expiresAt <= Date.now()) {
            this.store.delete(key);
            return null;
        }
        return entry.value;
    }

    /** Remove a single key. */
    del(key: string): void {
        this.store.delete(key);
    }

    /** Evict all expired entries. */
    private sweep(): void {
        const now = Date.now();
        for (const [key, entry] of this.store) {
            if (entry.expiresAt <= now) this.store.delete(key);
        }
    }

    /** Stop the background sweep (used on shutdown). */
    dispose(): void {
        clearInterval(this.sweepTimer);
    }
}
