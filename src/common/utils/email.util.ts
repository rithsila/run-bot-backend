// src/users/email.util.ts
export type CanonicalizeOptions = {
    gmailDots?: boolean; // remove dots in local part for gmail
    gmailPlus?: boolean; // strip +tag for gmail
};

export function canonicalizeEmail(
    raw: string,
    opts: CanonicalizeOptions = {},
): string {
    let email = raw.trim().toLowerCase();
    const at = email.indexOf('@');
    if (at === -1) return email;

    const local = email.slice(0, at);
    const domain = email.slice(at + 1);

    // apply gmail-specific rules if enabled
    if (domain === 'gmail.com' || domain === 'googlemail.com') {
        let l = local;
        if (opts.gmailPlus) {
            const plus = l.indexOf('+');
            if (plus > -1) l = l.slice(0, plus);
        }
        if (opts.gmailDots) {
            l = l.replace(/\./g, '');
        }
        email = `${l}@gmail.com`;
    }
    return email;
}

export function maskEmail(email: string): string {
    const [name, domain] = (email || '').split('@');
    if (!domain) return email;
    const visible = Math.min(2, name.length);
    return `${name.slice(0, visible)}***@${domain}`;
}
