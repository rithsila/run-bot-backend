// memberships.service.ts
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, PaginateOptions, Types } from 'mongoose';
import * as membershipsSchema from './memberships.schema';
import { JoinMembershipDto } from './dto/join-membership.dto';
import { User, UserDocument } from 'src/user/user.schema';
import { PaginateMembershipsDto } from './dto/paginate-memberships.dto';
import { PaginatedResult } from 'src/common/types/api-response.type';
import { MembershipDocument } from './memberships.schema';
import { UpdateMembershipAdminDto } from './dto/update-membership-admin.dto';


function normalizeAccounts(input?: string[]): string[] | undefined {
    if (!Array.isArray(input)) return undefined;
    const cleaned = Array.from(
        new Set(
            input
                .map(v => (typeof v === 'string' ? v.trim() : ''))
                .filter(v => v.length > 0),
        ),
    );
    if (cleaned.length === 0) return [];
    if (cleaned.length > 3) throw new BadRequestException('accounts can have at most 3 entries');
    return cleaned;
}


@Injectable()
export class MembershipsService {
    constructor(
        @InjectModel(membershipsSchema.Membership.name)
        private readonly membershipModel: membershipsSchema.MembershipPaginateModel,

        @InjectModel(User.name)
        private readonly userModel: Model<UserDocument>,
    ) { }

    async findByUserId(userId: string): Promise<MembershipDocument | null> {
        return this.membershipModel.findOne({ user: new Types.ObjectId(userId) }).exec();
    }

    async requestJoin(dto: JoinMembershipDto, currentUserId?: string) {
        // user is required (schema requires it)
        if (!currentUserId) throw new BadRequestException('USER_REQUIRED');

        // email is required (schema + DTO require it). Normalize.
        const emailRaw = dto.email;
        const email =
            typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : undefined;
        if (!email) throw new BadRequestException('EMAIL_REQUIRED');

        // normalize accounts (array of strings, up to 3)
        const accounts = normalizeAccounts(dto.accounts);

        // Uniqueness: one per user OR one per email
        const ors: FilterQuery<membershipsSchema.MembershipDocument>[] = [
            { user: new Types.ObjectId(currentUserId) },
            { email },
        ];

        const existing = await this.membershipModel.findOne({ $or: ors }).lean();
        if (existing) {
            throw new ConflictException('A membership for this user or email already exists.');
        }

        try {
            const created = await this.membershipModel.create({
                user: new Types.ObjectId(currentUserId),
                email,
                accounts,
                notes: dto.notes ?? undefined,
                status: membershipsSchema.MembershipStatus.Request,
            });

            return this.membershipModel.findById(created._id).lean();
        } catch (err: any) {
            if (err?.code === 11000) {
                // unique index collision (race)
                throw new ConflictException('A membership for this user or email already exists.');
            }
            throw err;
        }
    }

    /** APPEAL **/
    async appeal(userId: string, dto: JoinMembershipDto) {
        const membership = await this.membershipModel
            .findOne({ user: new Types.ObjectId(userId) })
            .exec();

        if (!membership) throw new NotFoundException('MEMBERSHIP_NOT_FOUND');

        if (
            membership.status !== membershipsSchema.MembershipStatus.Rejected &&
            membership.status !== membershipsSchema.MembershipStatus.Ended &&
            membership.status !== membershipsSchema.MembershipStatus.Verified
        ) {
            throw new ForbiddenException('APPEAL_NOT_ALLOWED');
        }

        // normalize incoming fields
        const emailProvided = Object.prototype.hasOwnProperty.call(dto, 'email');
        const email =
            typeof dto.email === 'string' ? dto.email.trim().toLowerCase() : undefined;

        const accountsProvided = Object.prototype.hasOwnProperty.call(dto, 'accounts');
        const accounts = normalizeAccounts(dto.accounts);

        // If email is provided, validate
        if (emailProvided) {
            if (!email) {
                // email is required by schema; don't allow clearing it
                throw new BadRequestException('EMAIL_REQUIRED');
            }
            const dup = await this.membershipModel
                .findOne({ email, _id: { $ne: membership._id } })
                .lean()
                .exec();
            if (dup) throw new ConflictException('A membership with this email already exists.');
            membership.email = email;
        }

        if (accountsProvided) {
            membership.accounts = accounts ?? []; // allow clearing with []
        }

        if (Object.prototype.hasOwnProperty.call(dto, 'notes')) {
            membership.notes = dto.notes?.trim() || undefined;
        }

        // Reset status/admin note for re-review
        membership.status = membershipsSchema.MembershipStatus.Request;
        membership.adminNotes = undefined;

        try {
            await membership.save();
            return this.membershipModel.findById(membership._id).lean().exec();
        } catch (err: any) {
            if (err?.code === 11000) {
                throw new ConflictException('A membership with this email already exists.');
            }
            throw err;
        }
    }

    async paginate(q: PaginateMembershipsDto): Promise<PaginatedResult<any>> {
        const filter: FilterQuery<membershipsSchema.MembershipDocument> = {};
        const or: FilterQuery<membershipsSchema.MembershipDocument>[] = [];

        // Build a case-insensitive regex once
        const term = q.q?.trim();
        const regex = term ? new RegExp(term, 'i') : undefined;

        // Search by membership email
        if (regex) {
            or.push({ email: { $regex: regex } });
        }

        // Search by user firstName / lastName (and optionally email)
        if (regex) {
            const users = await this.userModel
                .find(
                    {
                        $or: [
                            { firstName: { $regex: regex } },
                            { lastName: { $regex: regex } },
                            // optional: include user email in the same search term
                            { email: { $regex: regex } },
                        ],
                    },
                    { _id: 1 },
                )
                .limit(1000) // safety cap; tune as needed
                .lean()
                .exec();

            const userIds = users.map(u => u._id);
            if (userIds.length) {
                or.push({ user: { $in: userIds } });
            }
        }

        if (or.length) {
            filter.$or = or;
        }

        // Optional filter by status
        if (q.status) {
            filter.status = q.status;
        }

        const options: PaginateOptions = {
            page: q.page,
            limit: q.limit,
            sort: { createdAt: -1 },            // fixed sort
            lean: true,
            populate: [{ path: 'user', select: '_id email firstName lastName' }],
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

        const res: any = await this.membershipModel.paginate(filter, options);
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

    async updateAdmin(id: string, dto: UpdateMembershipAdminDto) {
        if (!Types.ObjectId.isValid(id)) {
            throw new BadRequestException('INVALID_ID');
        }

        const membership = await this.membershipModel.findById(id).exec();
        if (!membership) throw new NotFoundException('MEMBERSHIP_NOT_FOUND');

        // apply changes only if present
        if (dto.status !== undefined) {
            membership.status = dto.status;
        }
        if (dto.adminNotes !== undefined) {
            membership.adminNotes = dto.adminNotes?.trim() || undefined;
        }

        await membership.save();
        return this.membershipModel.findById(membership._id).lean().exec();
    }
}
