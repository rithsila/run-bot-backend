// src/referrals/referrals.service.ts
import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, PaginateOptions, Types } from 'mongoose';

import { Referral } from './referral.schema';
import type {
    ReferralDocument,
    ReferralPaginateModel,
} from './referral.schema';
import { User, UserDocument } from 'src/user/user.schema';
import { Role } from 'src/user/user.enum';

type CreateReferralInput = {
    ownerId: string;
    link: string;
    code: string;
};

type UpdateReferralInput = {
    ownerId?: string;
    link?: string;
    code?: string;
};

type PaginateReferralsInput = {
    page?: number;
    limit?: number;
    search?: string; // search by user firstName / lastName (case-insensitive)
};

@Injectable()
export class ReferralsService {
    constructor(
        @InjectModel(Referral.name)
        private readonly referralModel: ReferralPaginateModel,

        @InjectModel(User.name)
        private readonly userModel: Model<UserDocument>,
    ) {}

    // --- Helpers --------------------------------------------------------------

    private ensureAdmin(role?: Role) {
        if (role !== Role.Admin) {
            throw new ForbiddenException('ADMIN_ONLY');
        }
    }

    private normalizeCode(raw?: string): string | undefined {
        if (typeof raw !== 'string') return undefined;
        const v = raw.trim().toUpperCase();
        return v.length ? v : undefined;
    }

    private normalizeLink(raw?: string): string | undefined {
        if (typeof raw !== 'string') return undefined;
        const v = raw.trim();
        return v.length ? v : undefined;
    }

    private toObjectId(id: string, field: string): Types.ObjectId {
        if (!Types.ObjectId.isValid(id)) {
            throw new BadRequestException(`INVALID_${field.toUpperCase()}`);
        }
        return new Types.ObjectId(id);
    }

    // --- Create (admin only) --------------------------------------------------

    async createReferral(
        dto: CreateReferralInput,
        currentUserRole?: Role,
    ): Promise<ReferralDocument> {
        this.ensureAdmin(currentUserRole);

        const ownerId = this.toObjectId(dto.ownerId, 'owner_id');

        // make sure owner exists
        const ownerExists = await this.userModel
            .exists({ _id: ownerId })
            .exec();
        if (!ownerExists) {
            throw new NotFoundException('OWNER_NOT_FOUND');
        }

        const code = this.normalizeCode(dto.code);
        if (!code) throw new BadRequestException('CODE_REQUIRED');

        const link = this.normalizeLink(dto.link);
        if (!link) throw new BadRequestException('LINK_REQUIRED');

        try {
            const doc = await this.referralModel.create({
                owner: ownerId,
                link,
                code,
            });
            return doc;
        } catch (err: any) {
            if (err?.code === 11000) {
                // duplicate key (code or link)
                throw new ConflictException('REFERRAL_DUPLICATE');
            }
            throw err;
        }
    }

    // --- Update (admin only) --------------------------------------------------

    async updateReferralById(id: string, dto: UpdateReferralInput) {
        const _id = this.toObjectId(id, 'id');

        const doc = await this.referralModel.findById(_id).exec();
        if (!doc) {
            throw new NotFoundException('REFERRAL_NOT_FOUND');
        }

        if (dto.ownerId) {
            const ownerId = this.toObjectId(dto.ownerId, 'owner_id');
            const ownerExists = await this.userModel
                .exists({ _id: ownerId })
                .exec();
            if (!ownerExists) {
                throw new NotFoundException('OWNER_NOT_FOUND');
            }
            doc.owner = ownerId;
        }

        if (dto.link !== undefined) {
            const link = this.normalizeLink(dto.link);
            if (!link) throw new BadRequestException('LINK_REQUIRED');
            doc.link = link;
        }

        if (dto.code !== undefined) {
            const code = this.normalizeCode(dto.code);
            if (!code) throw new BadRequestException('CODE_REQUIRED');
            doc.code = code;
        }

        try {
            await doc.save();
            return this.referralModel
                .findById(doc._id)
                .populate({
                    path: 'owner',
                    select: '_id firstName lastName email',
                })
                .lean()
                .exec();
        } catch (err: any) {
            if (err?.code === 11000) {
                throw new ConflictException('REFERRAL_DUPLICATE');
            }
            throw err;
        }
    }

    // --- Delete (admin only) --------------------------------------------------

    async deleteReferralById(id: string, currentUserRole?: Role) {
        this.ensureAdmin(currentUserRole);

        const _id = this.toObjectId(id, 'id');

        const deleted = await this.referralModel
            .findByIdAndDelete(_id)
            .lean()
            .exec();
        if (!deleted) {
            throw new NotFoundException('REFERRAL_NOT_FOUND');
        }

        return deleted;
    }

    // --- Get one by owner -----------------------------------------------------

    async getByOwner(ownerId: string) {
        const _ownerId = this.toObjectId(ownerId, 'owner_id');

        const doc = await this.referralModel
            .findOne({ owner: _ownerId })
            .sort({ createdAt: -1 }) // latest if multiple
            .populate({ path: 'owner', select: '_id firstName lastName email' })
            .lean()
            .exec();

        if (!doc) {
            throw new NotFoundException('REFERRAL_NOT_FOUND');
        }

        return doc;
    }

    // --- Get all + search by user name ---------------------------------------

    async paginate(q: PaginateReferralsInput) {
        const page = q.page && q.page > 0 ? q.page : 1;
        const limit = q.limit && q.limit > 0 ? q.limit : 20;

        const filter: FilterQuery<ReferralDocument> = {};

        // search by user's firstName / lastName
        if (q.search && q.search.trim()) {
            const search = q.search.trim();
            const regex = new RegExp(search, 'i');

            const users = await this.userModel
                .find(
                    {
                        $or: [{ firstName: regex }, { lastName: regex }],
                    },
                    { _id: 1 },
                )
                .lean()
                .exec();

            const ownerIds = users.map((u) => u._id);

            if (!ownerIds.length) {
                // No matching users → return empty paginated response
                return {
                    items: [],
                    total: 0,
                    page,
                    limit,
                    totalPages: 0,
                    hasNext: false,
                    hasPrev: false,
                };
            }

            filter.owner = { $in: ownerIds };
        }

        const options: PaginateOptions = {
            page,
            limit,
            sort: { createdAt: -1 },
            lean: true,
            populate: [
                { path: 'owner', select: '_id firstName lastName email' },
            ],
            customLabels: {
                totalDocs: 'total',
                docs: 'items',
                page: 'page',
                limit: 'limit',
                totalPages: 'totalPages',
                hasPrevPage: 'hasPrev',
                hasNextPage: 'hasNext',
            },
        };

        const res: any = await this.referralModel.paginate(filter, options);

        return {
            items: res.items,
            total: res.total,
            page: res.page,
            limit: res.limit,
            totalPages: res.totalPages,
            hasNext: res.hasNext,
            hasPrev: res.hasPrev,
        };
    }
}
