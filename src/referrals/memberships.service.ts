// src/memberships/memberships.service.ts
import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, isValidObjectId } from 'mongoose';
import { Membership, MembershipDocument } from './memberships.schema';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { MembershipStatus } from './memberships.enum';
import { WebPushSubService } from 'src/web-push-sub/web-push-sub.service';
import { Role } from 'src/user/roles.enum';
import type {
    PaginateModel,
    PaginateResult,
} from 'mongoose';
import { Types } from 'mongoose';
import { MembershipsPaginateDto } from './dto/memberships-paginate.dto';
import { UpdateMembershipDto } from './dto/update-membership.dto';


function escapeRegex(str: string) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
        private readonly push: WebPushSubService,
        
    ) { }

    private ensureId(id?: string, name = 'id') {
        if (!id || !isValidObjectId(id)) throw new BadRequestException(`${name} is invalid`);
    }

    async requestJoin(userId: string, dto: CreateMembershipDto) {
        try {
            const isExisting = await this.membershipModel.findOne({
                user: new Types.ObjectId(userId),
            });

            if (isExisting) {
                throw new ConflictException('You can only request a membership once.');
            }

            const doc = await this.membershipModel.create({
                email: dto.email,
                user: new Types.ObjectId(userId),
                referral: dto.referral,
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
            throw err;
        }
    }

    async myMemberships(
        currentUserId: string,
        opts?: { includePartnerCode?: boolean }
    ) {
        this.ensureId(currentUserId, 'user');

        const referralSelect = ['title', 'logoUrl', 'broker'];
        if (opts?.includePartnerCode) referralSelect.push('partnerCode');

        return this.membershipModel
            .findOne({ user: currentUserId })
            .select('email referral accountNumbers status notes createdAt adminNotes')
            .populate({
                path: 'referral',
                select: referralSelect.join(' '),
                populate: {
                    path: 'broker',
                    model: 'Broker', // matches your @Schema class name
                    select: 'name logo', // keep it light
                },
            })
            .lean({ virtuals: true })
            .exec();
    }

    async updateById(id: string, dto: UpdateMembershipDto) {
        this.ensureId(id);
        if (!dto || (dto.status === undefined && dto.adminNotes === undefined)) {
            throw new BadRequestException('Nothing to update');
        }

        const ops: any = { $set: {} as Record<string, any> };

        if (dto.adminNotes !== undefined) {
            ops.$set.adminNotes = dto.adminNotes;
        }
        if (dto.status !== undefined) {
            ops.$set.status = dto.status;

            // Without actor info: only clear approvedBy if leaving Verified
            if (dto.status !== MembershipStatus.Verified) {
                ops.$unset = { ...(ops.$unset || {}), approvedBy: '' };
            }
        }

        const updated = await this.membershipModel.findByIdAndUpdate(id, ops, {
            new: true,
            runValidators: true,
        });

        if (!updated) throw new NotFoundException('Membership not found');

        const { title, body } = buildMembershipPush(updated?.status, dto.adminNotes);
        const targetUserId =
            typeof updated.user === 'string'
                ? updated.user
                : (updated.user as unknown as Types.ObjectId).toString();

        await this.push.sendToUser(targetUserId, {
            title,
            body,
            url: `/memberships/${updated._id}`,
            ts: Date.now(),
            type: 'membership_update',
            status: updated?.status,
        });

        return updated;
    }

    async updateMembership(membershipId: string, membership: CreateMembershipDto) {
        this.ensureId(membershipId, 'membershipId');
        const existing = await this.membershipModel
            .findById(membershipId)
            .select('_id user status')
            .lean()
            .exec();

        if (!existing) throw new NotFoundException('Membership not found');

        await this.membershipModel.findByIdAndUpdate(membershipId, {
            ...membership,
            status: MembershipStatus.Request
        })
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
    }

    async paginate(dto: MembershipsPaginateDto) {
        const page = Math.max(1, dto.page || 1);
        const limit = Math.min(100, Math.max(1, dto.limit || 20));

        const filter: FilterQuery<MembershipDocument> = {};

        // filter by status (exact)
        if (dto.status) {
            if (!Object.values(MembershipStatus).includes(dto.status)) {
                throw new BadRequestException('Invalid status');
            }
            filter.status = dto.status;
        }

        // search by email (case-insensitive). Use ^... for prefix; plain for contains.
        if (dto.search) {
            // contains:
            const rx = new RegExp(escapeRegex(dto.search), 'i');
            // prefix (faster with email index): const rx = new RegExp(`^${escapeRegex(dto.search)}`, 'i');
            filter.email = rx;
        }

        const result: PaginateResult<MembershipDocument> = await this.membershipModel.paginate(filter, {
            page,
            limit,
            sort: { createdAt: -1 },
            lean: true,
            leanWithId: true,
            populate: [
                { path: 'user', select: 'firstName lastName photoURL email' },
                { path: 'approvedBy', select: 'firstName lastName email' },
            ],
        });

        return {
            items: result.docs,
            page: result.page ?? page,
            limit: result.limit ?? limit,
            total: result.totalDocs,
            totalPages: result.totalPages,
            hasPrev: result.hasPrevPage,
            hasNext: result.hasNextPage,
        };
    }

    async getVerifiedMembership(userId: string): Promise<Membership | null> {
        this.ensureId(userId, 'user');

        return this.membershipModel
            .findOne({
                user: new Types.ObjectId(userId),
                status: MembershipStatus.Verified,
            })
            .select('email referral accountNumbers status notes createdAt adminNotes approvedBy')
            .populate({
                path: 'referral',
                select: 'title logoUrl broker',
                populate: { path: 'broker', model: 'Broker', select: 'name logo' },
            })
            .exec(); 
    }
}

