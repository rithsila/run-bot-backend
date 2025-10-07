// src/memberships/memberships.service.ts
import {
    BadRequestException,
    ConflictException,
    Injectable,
    InternalServerErrorException,
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
import type {
    PaginateModel,
    PaginateResult,
} from 'mongoose';
import { MembershipsPaginateDto } from './dto/memberships-paginate.dto';

type UpdateMembershipPayload = {
    status?: MembershipStatus;
    adminNotes?: string;
    reason?: string;
    updatedBy?: string; // optional audit
};


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
        @InjectModel(Membership.name) private readonly membershipModel: PaginateModel<MembershipDocument>,
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
        opts?: { reason?: string },
    ) {
        this.ensureId(membershipId, 'membershipId');

        if (!Object.values(MembershipStatus).includes(status)) {
            throw new BadRequestException('Invalid membership status');
        }

        // Load to know current status + owner
        const existing = await this.membershipModel
            .findById(membershipId)
            .select('_id user status')
            .lean()
            .exec();

        if (!existing) throw new NotFoundException('Membership not found');

        // Only update if changed
        if (existing.status !== status) {
            const setObj: Record<string, any> = { status };
            // persist reason if provided (useful for Rejected/Ended)
            if (opts?.reason) setObj.statusReason = opts.reason;

            await this.membershipModel.updateOne(
                { _id: existing._id },
                { $set: setObj },
            );
        }

        // Push to exactly ONE user (all active endpoints)
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
            status,
        });

        // Return fresh doc
        return this.membershipModel.findById(existing._id).lean().exec();
    }

    async updateMembership(membershipId: string, payload: UpdateMembershipPayload) {
        this.ensureId(membershipId, 'membershipId');

        const existing = await this.membershipModel
            .findById(membershipId)
            .select('_id user status')
            .lean()
            .exec();
        if (!existing) throw new NotFoundException('Membership not found');

        const setObj: Record<string, any> = {};
        let statusChanged = false;

        if (typeof payload.adminNotes === 'string') {
            setObj.adminNotes = payload.adminNotes;
        }

        if (payload.status) {
            if (!Object.values(MembershipStatus).includes(payload.status)) {
                throw new BadRequestException('Invalid membership status');
            }
            if (existing.status !== payload.status) {
                setObj.status = payload.status;
                statusChanged = true;
                if (payload.reason) setObj.statusReason = payload.reason;
            }
        }

        // Nothing to do
        if (!Object.keys(setObj).length) {
            return this.membershipModel.findById(existing._id).lean().exec();
        }

        await this.membershipModel.updateOne({ _id: existing._id }, { $set: setObj });

        // Send push only when status really changed
        if (statusChanged) {
            const { title, body } = buildMembershipPush(payload.status!, payload.reason);
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
                status: payload.status,
            });
        }

        return this.membershipModel.findById(existing._id).lean().exec();
    }

    async paginate(q: MembershipsPaginateDto) {
        // sanitize inputs
        const page = Math.max(1, Number(q.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));

        const filter: FilterQuery<MembershipDocument> = {};
        if (q.status) {
            if (!Object.values(MembershipStatus).includes(q.status)) {
                throw new BadRequestException('Invalid status');
            }
            filter.status = q.status;
        }

        const result: PaginateResult<MembershipDocument> =
            await this.membershipModel.paginate(filter, {
                page,
                limit,
                sort: { createdAt: -1 },
                lean: true,           // return POJOs (faster for API)
                leanWithId: true,     // keep id
                select: '-adminNotes' // (optional) hide adminNotes from list
            });

        return {
            items: result.docs,
            page: result.page ?? page,        // 1-based
            limit: result.limit ?? limit,
            total: result.totalDocs,
            totalPages: result.totalPages,
            hasPrevPage: result.hasPrevPage,
            hasNextPage: result.hasNextPage,
            prevPage: result.prevPage ?? null,
            nextPage: result.nextPage ?? null,
        };
    }

}