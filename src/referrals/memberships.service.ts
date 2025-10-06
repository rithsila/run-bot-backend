// src/memberships/memberships.service.ts
import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types, isValidObjectId } from 'mongoose';
import { Referral, ReferralDocument } from './referrals.schema';
import { Membership, MembershipDocument } from './memberships.schema';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { MembershipStatus } from './memberships.enum';
import { WebPushSubService } from 'src/web-push-sub/web-push-sub.service';
import { Role } from 'src/user/roles.enum';

export function buildMembershipPush(status: MembershipStatus, reason?: string) {

    switch (status) {
        case MembershipStatus.Verified:
            return {
                title: 'Membership verified ✅',
                body: 'Your membership has been verified. Welcome aboard!',
            };
        case MembershipStatus.Rejected:
            return {
                title: 'Membership rejected ❌',
                body: reason?.trim()
                    ? `Reason: ${reason.trim().slice(0, 140)}`
                    : 'Your membership request was not approved.',
            };
        case MembershipStatus.Ended:
            return {
                title: 'Membership ended 🔚',
                body: reason?.trim()
                    ? `Note: ${reason.trim().slice(0, 140)}`
                    : 'Your membership has ended.',
            };
        case MembershipStatus.Request:
        default:
            return {
                title: 'Membership under review 🕒',
                body: 'Your request is being reviewed.',
            };
    }
}


@Injectable()
export class MembershipsService {
    constructor(
        @InjectModel(Membership.name) private readonly membershipModel: Model<MembershipDocument>,
        @InjectModel(Referral.name) private readonly referralModel: Model<ReferralDocument>,
        private readonly push: WebPushSubService,
    ) { }

    private ensureId(id?: string, name = 'id') {
        if (!id || !isValidObjectId(id)) throw new BadRequestException(`${name} is invalid`);
    }

    async requestJoin(userId: string, dto: CreateMembershipDto) {

        const referral = await this.referralModel.findById(dto.referral).select('_id').lean();
        if (!referral) throw new NotFoundException('Referral not found');

        try {

            const doc = await this.membershipModel.create({
                email: dto.email,
                user: new Types.ObjectId(userId),
                referral: new Types.ObjectId(dto.referral),
                accountNumbers: dto.accountNumbers,
                notes: dto.notes,
                status: MembershipStatus.Request,
            });

            void this.push.sendToRoles(
                [Role.Admin, Role.Creator],
                {
                    title: `Membership request!`,
                    body: 'New membership request submitted.',
                    ts: Date.now(),
                    type: 'membership_request',
                },
                60,
            );

            return doc;
        } catch (err: any) {
            if (err?.code === 11000) {
                throw new ConflictException('This user already has a membership for this referral.');
            }
            throw err;
        }
    }

    async myMemberships(currentUserId: string) {
        this.ensureId(currentUserId, 'user');

        return this.membershipModel
            .find({ user: currentUserId })
            .populate([
                { path: 'user', select: 'firstName lastName email' },
                {
                    path: 'referral',
                    select: 'partnerCode registerUrl', // add fields you need from Referral
                    populate: [
                        { path: 'broker', select: 'name logo description' },
                        { path: 'user', select: 'firstName lastName email' },
                    ],
                },
            ])
            .lean()
            .exec();
    }


    async findAll(query: {
        page?: number | string;
        limit?: number | string;
        status?: MembershipStatus | string;
        broker?: string;
        user?: string;
        includePartnerCode?: '1' | 'true';
    }) {
        const page = Math.max(1, Number(query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

        const filter: FilterQuery<MembershipDocument> = {};
        if (query.status && Object.values(MembershipStatus).includes(query.status as MembershipStatus)) {
            filter.status = query.status as MembershipStatus;
        }
        if (query.broker) {
            this.ensureId(query.broker, 'broker');
            filter.broker = query.broker;
        }
        if (query.user) {
            this.ensureId(query.user, 'user');
            filter.user = query.user;
        }

        const q = this.membershipModel
            .find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate([
                { path: 'user', select: 'firstName lastName email' },
                {
                    path: 'referral',
                    select: 'partnerCode registerUrl', // add fields you need from Referral
                    populate: [
                        { path: 'broker', select: 'name logo description' },
                        { path: 'user', select: 'firstName lastName email' },
                    ],
                },
            ])

        // partnerCode is select:false by default; include only when explicitly asked
        if (query.includePartnerCode === '1' || query.includePartnerCode === 'true') {
            q.select('+partnerCode');
        }

        const [data, total] = await Promise.all([q.lean().exec(), this.membershipModel.countDocuments(filter)]);
        return {
            data,
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
        };
    }



    async updateStatus(
        membershipId: string,
        status: MembershipStatus,
        opts?: { reason?: string },   // pass a reason for Rejected/Ended if you have one
    ) {
        // 1) Validate status
        if (!Object.values(MembershipStatus).includes(status)) {
            throw new BadRequestException('Invalid membership status');
        }

        // 2) Load membership to know whom to notify
        const existing = await this.membershipModel
            .findById(membershipId)
            .select('_id user status')
            .lean()
            .exec();
        if (!existing) throw new NotFoundException('Membership not found');

        // 3) Only update if changed
        if (existing.status !== status) {
            await this.membershipModel.updateOne(
                { _id: existing._id },
                { $set: { status } },
            );
        }

        // 4) Push to exactly ONE user (all their active endpoints)
        const { title, body } = buildMembershipPush(status, opts?.reason);
        const targetUserId =
            typeof existing.user === 'string'
                ? existing.user
                : (existing.user as unknown as Types.ObjectId).toString();

        await this.push.sendToUser(targetUserId, {
            title,
            body,
            url: `/memberships/${existing._id}`,
            ts: Date.now(),
            type: 'membership_update',
            status, // optional: lets client render different UI per status
        });

        // 5) Return fresh doc
        return this.membershipModel.findById(existing._id).lean().exec();
    }

}