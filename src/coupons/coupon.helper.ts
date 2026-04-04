// src/coupons/helpers/build-admin-tiny-payload.ts

import { CouponStatus } from './coupon.schema';

type TinyPayload = { title: string; body: string };

type CouponLike = {
    code?: string | null;
    name?: string | null;
    status?: CouponStatus | null;
    percent?: number | null;
    validFrom?: Date | string | null; // optional, if your schema has it
    validTo?: Date | string | null; // optional, if your schema has it
};

type UpdateCouponPayloadLike = {
    status?: CouponStatus;
    percent?: number;
};

type BuildOptions = {
    /** Show validity window if present on the doc (validFrom/validTo) */
    includeValidity?: boolean; // default false
    /** Date formatter for validity range (defaults to YYYY-MM-DD) */
    formatDate?: (d: Date | string) => string;
};

const defaultFormatDate = (d: Date | string) => {
    const dt = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(+dt)) return '';
    // ISO-like, short
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const da = String(dt.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${da}`;
};

function labelForCoupon(doc: CouponLike): string {
    const code = doc?.code?.trim();
    const name = doc?.name?.trim();
    if (code && name) return `${code} (${name})`;
    if (code) return code;
    if (name) return name;
    return 'the coupon';
}

function percentPart(p?: number | null): string {
    if (typeof p === 'number' && !Number.isNaN(p)) {
        // Show up to two decimals, trim trailing zeros
        const pretty = Number.isInteger(p)
            ? String(p)
            : String(Number(p.toFixed(2)));
        return ` (discount set to ${pretty}%)`;
    }
    return '';
}

function validityPart(
    doc: CouponLike,
    include: boolean,
    fmt: (d: Date | string) => string,
): string {
    if (!include) return '';
    const from = doc?.validFrom ? fmt(doc.validFrom) : '';
    const to = doc?.validTo ? fmt(doc.validTo) : '';
    if (from && to) return ` Valid: ${from}–${to}.`;
    if (from) return ` Starts: ${from}.`;
    if (to) return ` Ends: ${to}.`;
    return '';
}

/**
 * Build a tiny admin-facing payload for coupon status updates.
 */
export function buildCouponAdminTinyPayload(
    doc: CouponLike,
    payload: UpdateCouponPayloadLike = {},
    options: BuildOptions = {},
): TinyPayload {
    const statusToUse: CouponStatus =
        payload.status ?? doc.status ?? CouponStatus.Request;
    const showValidity = options.includeValidity ?? false;
    const fmt = options.formatDate ?? defaultFormatDate;

    const label = labelForCoupon(doc);
    const pct = percentPart(payload.percent ?? doc.percent ?? null);
    const validity = validityPart(doc, showValidity, fmt);

    switch (statusToUse) {
        case CouponStatus.Request:
            return {
                title: 'New coupon request',
                body: `${label} has been submitted for review.${pct}${validity}`,
            };

        case CouponStatus.Active:
            return {
                title: 'Coupon activated',
                body: `${label} is now active.${pct}${validity}`,
            };

        case CouponStatus.Inactive:
            return {
                title: 'Coupon deactivated',
                body: `${label} is now inactive.${validity}`,
            };

        case CouponStatus.Scheduled:
            return {
                title: 'Coupon scheduled',
                body: `${label} has been scheduled.${pct}${validity}`,
            };

        case CouponStatus.Expired:
            return {
                title: 'Coupon expired',
                body: `${label} has expired.${validity}`,
            };

        default:
            return {
                title: 'Coupon update',
                body: `${label} status has been updated.${pct}${validity}`,
            };
    }
}
