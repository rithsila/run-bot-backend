// src/coupons/coupons.service.ts
import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, PaginateOptions, Types } from 'mongoose';

// Value imports (used at runtime)
import { Coupon, CouponStatus } from './coupon.schema';

// Type-only imports (erased at compile time)
import type { CouponPaginateModel } from './coupon.schema';
import { PaginateCouponsDto } from './dto/paginate-coupons.dto';
import { Membership, MembershipDocument, MembershipStatus } from 'src/memberships/memberships.schema';
import { PushProducer } from 'src/queue/push.producer';
import { WebPushSubService } from 'src/web-push-sub/web-push-sub.service';
import { buildCouponAdminTinyPayload } from './coupon.helper';

export type MyCouponLite = {
    code: string;
    status: CouponStatus;
    percent: number;
};


@Injectable()
export class CouponsService {
    constructor(
        @InjectModel(Coupon.name)
        private readonly couponModel: CouponPaginateModel,
        @InjectModel(Membership.name)
        private readonly membershipModel: Model<MembershipDocument>,
        private readonly pushProducer: PushProducer,
        private readonly webPushSubService: WebPushSubService
    ) { }

    private normalizeCode(raw?: string): string | undefined {
        if (typeof raw !== 'string') return undefined;
        const v = raw.trim().toUpperCase();
        return v.length ? v : undefined;
    }

    async request(dto: { code: string }, currentUserId?: string) {
        if (!currentUserId) throw new BadRequestException('USER_REQUIRED');

        const code = this.normalizeCode(dto.code);
        if (!code) throw new BadRequestException('CODE_REQUIRED');

        const userId = new Types.ObjectId(currentUserId);

        // ✅ Membership gate: must exist and be Verified
        const membership = await this.membershipModel
            .findOne({ user: userId }, { _id: 1, status: 1 }).populate('user')
            .lean()
            .exec();

        if (!membership) {
            // no membership on file
            throw new ForbiddenException('MEMBERSHIP_REQUIRED');
        }
        if (membership.status !== MembershipStatus.Verified) {

            throw new ForbiddenException('MEMBERSHIP_NOT_VERIFIED');
        }

        // If another user's coupon already uses this code, block it.
        const conflict = await this.couponModel
            .findOne({ code, createdBy: { $ne: userId } })
            .lean()
            .exec();

        if (conflict) {
            throw new ConflictException('A coupon with this code already exists.');
        }

        try {
            // Upsert by current user
            const doc = await this.couponModel
                .findOneAndUpdate(
                    { createdBy: userId },
                    {
                        $set: {
                            code,
                            status: CouponStatus.Request,
                        },
                        $setOnInsert: {
                            createdBy: userId,
                        },
                    },
                    { new: true, upsert: true, lean: true }
                )
                .exec();


            try {
                const tinyPayload = {
                    title: 'New affiliate request',
                    body: `${membership?.user?.firstName} ${membership?.user?.lastName} just asked to join`,
                };

                // Exclude author if provided on dto (optional)
                let excludeId: Types.ObjectId | null = null;
                const maybeAuthorId = (dto as any)?.authorId;
                if (maybeAuthorId) {

                    try { excludeId = new Types.ObjectId(String(maybeAuthorId)); } catch { /* ignore bad id */ }
                }



                // Get recipients (all active users, optionally excluding author).
                const recipients = await this.webPushSubService.getAdminIds();

                if (recipients.length) {
                    await this.pushProducer.enqueueSendToUsers(
                        recipients,
                        tinyPayload,
                        { ttl: 3600, chunkSize: 500 }
                    );
                }
            } catch (e) {
                // Don’t block creation on push failures
                console.warn('[AnalyzeNews.create] push enqueue failed:', e);
            }

            return doc;
        } catch (err: any) {
            if (err?.code === 11000) {
                throw new ConflictException('A coupon with this code already exists.');
            }
            throw err;
        }
    }

    async getCodesByUserId(userId?: string): Promise<MyCouponLite | null> {
        if (!userId) throw new BadRequestException('USER_REQUIRED');

        const row = await this.couponModel
            .findOne({ createdBy: new Types.ObjectId(userId) })
            .select({ code: 1, status: 1, percent: 1, _id: 0 })
            .sort({ updatedAt: -1, createdAt: -1 }) // newest first if multiple exist historically
            .lean()
            .exec();

        if (!row) return null;

        const code = String(row.code ?? '').trim();
        if (!code) return null;

        const percent =
            typeof row.percent === 'number' && Number.isFinite(row.percent) ? row.percent : 20;

        return {
            code,
            status: row.status as CouponStatus,
            percent,
        };
    }

    async paginate(q: PaginateCouponsDto) {
        const filter: FilterQuery<any> = {};
        if (q.status) filter.status = q.status;

        const options: PaginateOptions = {
            page: q.page,
            limit: q.limit,
            sort: { createdAt: -1 },
            lean: true,
            populate: [{ path: 'createdBy', select: '_id email firstName lastName' }],
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

        const res: any = await this.couponModel.paginate(filter, options);
        return {
            items: res.items,      // each item now includes createdBy {...}
            total: res.total,
            page: res.page,
            limit: res.limit,
            totalPages: res.totalPages,
            hasNext: res.hasNext,
            hasPrev: res.hasPrev,
        };
    }

    async updateStatusById(
        id: string,
        payload: { status?: CouponStatus; percent?: number },
    ) {
        if (!Types.ObjectId.isValid(id)) throw new BadRequestException('INVALID_ID');

        const doc = await this.couponModel.findById(id).exec();
        if (!doc) throw new NotFoundException('COUPON_NOT_FOUND');

        const { status, percent } = payload;

        if (status !== undefined) {
            doc.status = status;
        }

        if (percent !== undefined) {
            if (typeof percent !== 'number' || Number.isNaN(percent)) {
                throw new BadRequestException('PERCENT_INVALID');
            }
            if (percent < 0.01 || percent > 100) {
                throw new BadRequestException('PERCENT_OUT_OF_RANGE');
            }
            doc.percent = percent;
        }

        await doc.save();

        // Build the admin notification (optional)
        try {
            const tinyPayload = buildCouponAdminTinyPayload(doc, payload, {
                includeValidity: true, // set false if you don't track validFrom/validTo
                // formatDate: (d) => new Date(d).toLocaleDateString('en-US'), // custom if you prefer
            });

            const userId = doc?.createdBy || ''
            const recipients = [new Types.ObjectId(userId?.toString())];

            if (recipients.length) {
                await this.pushProducer.enqueueSendToUsers(
                    recipients,
                    tinyPayload,
                    { ttl: 3600, chunkSize: 500 },
                );
            }
        } catch (e) {
            console.warn('[Coupon.updateStatusById] push enqueue failed:', e);
        }

        return this.couponModel.findById(doc._id).lean().exec();
    }

    async apply(rawCode: string): Promise<{
        code: string;
        percent: number;
        owner: { firstName?: string; lastName?: string };
    }> {
        const code = this.normalizeCode(rawCode);
        if (!code) throw new BadRequestException('CODE_REQUIRED');

        const doc = await this.couponModel
            .findOne({ code, status: CouponStatus.Active })
            .populate({ path: 'createdBy', select: 'firstName lastName', options: { lean: true } })
            .lean()
            .exec();

        if (!doc) {
            // Not found OR not active
            throw new NotFoundException('COUPON_INVALID_OR_INACTIVE');
        }

        const owner = {
            firstName: (doc as any)?.createdBy?.firstName,
            lastName: (doc as any)?.createdBy?.lastName,
        };

        return {
            code: doc.code,
            percent: doc.percent,
            owner,
        };
    }
}
