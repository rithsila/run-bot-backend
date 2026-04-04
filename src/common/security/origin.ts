// src/common/security/origin.ts
export function normalizeOrigin(o?: string | null) {
    if (!o) return null;
    try {
        const u = new URL(o);
        return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}`.toLowerCase();
    } catch {
        return null;
    }
}

export function buildAllowedOrigins(list: Array<string | undefined | null>) {
    const normalized = list.map(normalizeOrigin).filter(Boolean) as string[];
    return Array.from(new Set(normalized));
}
