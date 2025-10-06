// src/ea-snqp/ea-snqp.service.ts
import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId, Types, FilterQuery } from 'mongoose';
import { MembershipStatus } from 'src/referrals/memberships.enum';
import { RequestSnqpDto } from './dto/request-snqp.dto';
import { EaSnqp, EaSnqpDocument } from './ea-snqp.schema';
import { GetAllSnqpDto } from './dto/get-all-snqp.dto';
import { UpdateSnqpStatusDto } from './dto/update-snqp-status.dto';
import { WebPushSubService } from 'src/web-push-sub/web-push-sub.service';
import { Role } from 'src/user/roles.enum';
import { buildMembershipPush } from 'src/referrals/memberships.service';

@Injectable()
export class EaSnqpService {

    constructor(
        @InjectModel(EaSnqp.name)
        private readonly model: Model<EaSnqpDocument>,
        private readonly push: WebPushSubService,
    ) { }

    private ensureUser(id?: string) {
        if (!id || !isValidObjectId(id)) {
            throw new BadRequestException('user is invalid');
        }
    }

    async requestSnqp(currentUserId: string, body: RequestSnqpDto) {
        this.ensureUser(currentUserId);

        const dupFilter: FilterQuery<EaSnqpDocument> = {
            user: new Types.ObjectId(currentUserId),
            status: { $in: [MembershipStatus.Request, MembershipStatus.Verified] },
        };

        const dup = await this.model.exists(dupFilter);
        if (dup) {
            throw new BadRequestException(
                'You already have a pending request the license!',
            );
        }

        const created = await this.model.create({
            user: new Types.ObjectId(currentUserId),
            accountNumbers: body.accountNumbers ?? [],
            bankAccount: body.bankAccount || undefined,
            tradingView: body.tradingView || undefined,
            status: MembershipStatus.Request,
        });

        void this.push.sendToRoles(
            [Role.Admin, Role.Creator],
            {
                title: `License request!`,      // from previous step
                body: 'New license request submitted.',
                ts: Date.now(),
                type: 'license_request',                   // optional, handy on client
            },
            60,
            new Types.ObjectId(currentUserId),           // exclude requester (optional)
        );

        return this.model.findById(created._id).lean().exec();
    }

    async mySnqp(userId: string, status?: MembershipStatus) {
        const filter: any = { user: new Types.ObjectId(userId) };
        if (status) filter.status = status;
        const rows = await this.model
            .find(filter)
            .sort({ createdAt: -1 })
            .select("+licenseKey") // read it server-side
            .lean()
            .exec()

        const items = (await rows).map((r: any) => {
            const license =
                r.status === "Verified" && r.licenseKey ? r.licenseKey : "No license Key Verified!";
            delete r.licenseKey;
            return { ...r, license };
        });
        return items
    }

    async getAll(dto: GetAllSnqpDto) {
        const page = Math.max(1, dto.page ?? 1);
        const limit = Math.min(100, Math.max(1, dto.limit ?? 20));
        const skip = (page - 1) * limit;

        const match: any = {};
        if (dto.status) match.status = dto.status;
        if (dto.userId) match.user = new Types.ObjectId(dto.userId);

        // Build a case-insensitive regex for q (if present)
        const searchRegex = dto.q?.trim()
            ? new RegExp(this.escapeRegex(dto.q.trim()), 'i')
            : null;

        /** Pipeline:
         * 1) Pre-filter by status/userId
         * 2) Join user (to search on user fields)
         * 3) Optional $match for search (bankAccount + user fields)
         * 4) Sort, facet for pagination + total
         */
        const pipeline: any[] = [
            { $match: match },
            {
                $lookup: {
                    from: 'users',        // collection name of User
                    localField: 'user',
                    foreignField: '_id',
                    as: 'userDoc',
                },
            },
            { $unwind: '$userDoc' },
        ];

        if (searchRegex) {
            pipeline.push({
                $match: {
                    $or: [
                        { bankAccount: { $regex: searchRegex } },
                        { 'userDoc.firstName': { $regex: searchRegex } },
                        { 'userDoc.lastName': { $regex: searchRegex } },
                        { 'userDoc.email': { $regex: searchRegex } },
                    ],
                },
            });
        }

        pipeline.push(
            { $sort: { createdAt: -1 } },
            {
                $facet: {
                    items: [
                        { $skip: skip },
                        { $limit: limit },
                        {
                            $project: {
                                _id: 1,
                                tradingView: 1,
                                accountNumbers: 1,
                                bankAccount: 1,
                                status: 1,
                                issueDate: 1,
                                expiryDate: 1,
                                createdAt: 1,
                                updatedAt: 1,

                                // License exposure policy:
                                // For admin list, include a derived "license" string but do NOT expose raw licenseKey field.
                                license: {
                                    $cond: [
                                        { $and: [{ $eq: ['$status', 'Verified'] }, { $ne: ['$licenseKey', ''] }] },
                                        '$licenseKey',
                                        'No license Key Verified!',
                                    ],
                                },

                                user: {
                                    _id: '$userDoc._id',
                                    firstName: '$userDoc.firstName',
                                    lastName: '$userDoc.lastName',
                                    email: '$userDoc.email',
                                    photoURL: '$userDoc.photoURL',
                                    role: '$userDoc.role',
                                },
                            },
                        },
                    ],
                    meta: [
                        { $count: 'total' },
                    ],
                },
            }
        );

        const res = await this.model.aggregate(pipeline).allowDiskUse(true).exec();
        const items = res?.[0]?.items ?? [];
        const total = res?.[0]?.meta?.[0]?.total ?? 0;
        const totalPages = Math.max(1, Math.ceil(total / limit));

        return { items, page, limit, total, totalPages };
    }

    async updateStatus(id: string, currentUserId: string, dto: UpdateSnqpStatusDto, opts?: { reason?: string },) {
        if (!isValidObjectId(id)) throw new BadRequestException('invalid id');

        if (![MembershipStatus.Verified, MembershipStatus.Rejected].includes(dto.status)) {
            throw new BadRequestException('Only "Verified" or "Rejected" status is allowed.');
        }

        const license = (dto.license ?? '').trim();
        // license required only for Verified
        if (dto.status === MembershipStatus.Verified && !license) {
            throw new BadRequestException('license is required to verify.');
        }

        const doc = await this.model.findById(id).lean().exec();
        if (!doc) throw new NotFoundException('License request not found');

        try {
            const existing = await this.model.updateOne(
                { _id: id },
                {
                    $set: {
                        status: dto.status,
                        // ✅ Verified → licenseKey = license; Rejected → licenseKey = ""
                        licenseKey: dto.status === MembershipStatus.Verified ? license : '',
                        // (optional date bumps on verify)
                        // ...(dto.status === MembershipStatus.Verified ? {
                        //   issueDate: new Date(),
                        //   expiryDate: new Date(Date.now() + 365*24*60*60*1000),
                        // } : {}),
                    },
                },
                { runValidators: true },
            );


            // 4) Push to exactly ONE user (all their active endpoints)
            const { title, body } = buildMembershipPush(dto.status, opts?.reason);


            await this.push.sendToUser(currentUserId, {
                title,
                body,
                url: `/memberships`,
                ts: Date.now(),
                type: 'membership_update',
                status, // optional: lets client render different UI per status
            });

        } catch (e: any) {
            if (e?.code === 11000 && e?.keyPattern?.licenseKey) {
                throw new BadRequestException('This license key is already in use.');
            }
            throw e;
        }

        const updated = await this.model.findById(id).select('+licenseKey').lean().exec();
        if (!updated) throw new NotFoundException('License request not found after update');

        const safe = {
            _id: updated._id,
            accountNumbers: updated.accountNumbers,
            bankAccount: updated.bankAccount,
            status: updated.status,
            issueDate: updated.issueDate,
            expiryDate: updated.expiryDate,
            // ✅ Rejected returns "", Verified returns actual key
            license: updated.status === MembershipStatus.Verified ? (updated.licenseKey ?? '') : '',
            user: doc.user,
        };

        return safe;
    }

    private escapeRegex(s: string) {
        return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
