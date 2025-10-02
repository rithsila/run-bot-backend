// src/lib/utils/regex.ts
/**
 * Escape regex special characters from input string
 */
export function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Split query string into tokens and return case-insensitive regex list
 */
export function buildTokenRegexes(q?: string): RegExp[] {
    if (!q) return [];
    const tokens = q.trim().split(/\s+/).filter(Boolean);
    return tokens.map((t) => new RegExp(escapeRegExp(t), "i"));
}
