// src/memberships/interfaces/membership-lead.interface.ts
import { Types } from 'mongoose';
import { MembershipAccountType, MembershipStatus } from 'src/memberships/memberships.schema';
import { User } from 'src/user/user.schema';

// 🔹 Lean version of Referral (from referral.schema.ts)
export interface ReferralLean {
    _id: Types.ObjectId;
    owner: Types.ObjectId;
    link: string;
    code: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface MembershipLead {
    _id: Types.ObjectId;

    email: string;

    user: Types.ObjectId | User;
    status: MembershipStatus;
    notes?: string;
    referral?: Types.ObjectId | ReferralLean;

    adminNotes?: string;

    accounts: MembershipAccountType[];

    licenseKey?: string;

    createdAt: Date;
    updatedAt: Date;
}
