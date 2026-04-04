import { BadRequestException } from '@nestjs/common';
import { MembershipStatus } from './memberships.schema';

export function normalizeAccounts(input?: string[]): string[] | undefined {
    if (!Array.isArray(input)) return undefined;
    const cleaned = Array.from(
        new Set(
            input
                .map((v) => (typeof v === 'string' ? v.trim() : ''))
                .filter((v) => v.length > 0),
        ),
    );
    if (cleaned.length === 0) return [];
    if (cleaned.length > 10)
        throw new BadRequestException('accounts can have at most 10 entries');
    return cleaned;
}

type TinyPayload = { title: string; body: string };

type UserLike = {
    firstName?: string | null;
    lastName?: string | null;
};

type MembershipLike = {
    user?: UserLike | null;
    status?: MembershipStatus | null;
    name?: string | null;
    membershipName?: string | null;
};

type UpdateMembershipAdminDtoLike = {
    status?: MembershipStatus;
    adminNotes?: string;
};

type BuildOptions = {
    /** Max characters of adminNotes to surface in notification (Rejected/Ended) */
    maxReasonLength?: number; // default 160
};

/**
 * Build a small admin-facing notification payload for a membership status event.
 */
export function buildAdminTinyPayload(
    membership: MembershipLike,
    dto: UpdateMembershipAdminDtoLike = {},
    options: BuildOptions = {},
): TinyPayload {
    const maxReasonLength = options.maxReasonLength ?? 160;

    const fullName =
        [membership?.user?.firstName, membership?.user?.lastName]
            .filter(Boolean)
            .join(' ') || 'A user';

    const membershipLabel = (
        membership?.name ||
        membership?.membershipName ||
        ''
    ).trim();

    const reason = (dto.adminNotes?.trim() || '').slice(0, maxReasonLength);

    const statusToUse: MembershipStatus =
        dto.status ?? membership?.status ?? MembershipStatus.Request;

    switch (statusToUse) {
        case MembershipStatus.Request: {
            const tail = membershipLabel
                ? ` ${membershipLabel}`
                : ' the membership';
            return {
                title: 'New membership request',
                body: `${fullName} just requested to join${tail}.`,
            };
        }
        case MembershipStatus.Verified: {
            const tail = membershipLabel ? ` for ${membershipLabel}` : '';
            return {
                title: 'Membership verified',
                body: `${fullName} has been verified${tail}.`,
            };
        }
        case MembershipStatus.Rejected: {
            const tail = membershipLabel ? ` for ${membershipLabel}` : '';
            return {
                title: 'Membership rejected',
                body: reason
                    ? `${fullName}'s request${tail} was rejected. Reason: ${reason}`
                    : `${fullName}'s request${tail} was rejected.`,
            };
        }
        case MembershipStatus.Ended: {
            const tail = membershipLabel ? ` for ${membershipLabel}` : '';
            return {
                title: 'Membership ended',
                body: reason
                    ? `${fullName}'s membership${tail} has ended. Note: ${reason}`
                    : `${fullName}'s membership${tail} has ended.`,
            };
        }
        default: {
            return {
                title: 'Membership update',
                body: `${fullName} has an updated membership status.`,
            };
        }
    }
}
