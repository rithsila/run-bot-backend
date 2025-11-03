// src/subscriptions/subscriptions.service.ts
import {
    Injectable,
    BadRequestException,
    ConflictException,
    NotFoundException,
    ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import * as subscriptionSchema from './subscription.schema';
import { Coupon, CouponDocument } from 'src/plan/coupon.schema';
import { Plan, PlanDocument } from 'src/plan/plan.schema';
import { CouponStatus } from 'src/plan/plan.enum';
import { SubscriptionsPaginateDto } from './dto/subscriptions-paginate.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';

function escapeRegex(str: string) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


@Injectable()
export class SubscriptionService {
    constructor(
        @InjectModel(subscriptionSchema.Subscription.name) private readonly subscriptionModel: subscriptionSchema.SubscriptionPaginateModel,
        @InjectModel(Plan.name) private readonly planModel: Model<PlanDocument>,
        @InjectModel(Coupon.name) private readonly couponModel: Model<CouponDocument>,
    ) { }

    async createPayment(userId: Types.ObjectId, dto: CreateSubscriptionDto) {
        // ---------- 1) Validate plan ----------
        const plan = await this.planModel.findById(dto.plan).lean();

        if (!plan) {
            throw new NotFoundException('Plan not found.');
        }

        // decide billingPeriod
        // either dto.billingPeriod or plan.billingPeriod (your current code uses plan.billingPeriod)
        const billingPeriod = plan.billingPeriod;
        if (![1, 3, 6, 12].includes(billingPeriod)) {
            throw new BadRequestException('Invalid billing period.');
        }

        // ---------- 2) Optional coupon ----------
        const couponDoc = dto.couponCode
            ? await this.couponModel
                .findOne({
                    code: dto.couponCode.trim(),
                    status: CouponStatus.Active,
                })
                .select('_id discount') // only what we need
                .lean()
            : null;

        // ---------- 3) Compute base amount ----------
        // ---------- 4) Apply coupon (if any) ----------
        const discount = couponDoc?.discount ? couponDoc.discount : 0;

        // ---------- 5) Check for existing sub for THIS plan ----------
        // We only care about subs where user + plan match.
        // We'll grab the most recent one.
        const existingSub = await this.subscriptionModel
            .findOne({
                user: userId,
                plan: new Types.ObjectId(dto.plan),
            })
            .sort({ createdAt: -1 }) // newest first just in case
            .exec();

        const now = new Date();
        const nextInvoiceAt = this.addMonthsSafe(now, billingPeriod);

        if (existingSub) {
            // cases:
            // A) status = 'init'  -> block
            // B) status = 'active' or 'paused' -> block
            // C) status = 'canceled' or 'past_due' -> revive (set status='init', update fields)

            if (
                existingSub.status === 'init' ||
                existingSub.status === 'active' ||
                existingSub.status === 'paused'
            ) {
                // user is already holding / using this plan
                throw new ConflictException(
                    'You already have a subscription for this plan.'
                );
            }

            if (
                existingSub.status === 'cancelled' ||
                existingSub.status === 'past_due'
            ) {
                // ---------- 5b) revive old row instead of creating new ----------
                existingSub.status = 'init';
                existingSub.startAt = now;
                existingSub.billingPeriod = billingPeriod;
                existingSub.amount = plan.price;
                existingSub.coupon = couponDoc ? couponDoc._id : null;
                existingSub.discount = discount;
                existingSub.bankAccountName = dto.bankAccountName.trim();
                existingSub.nextInvoiceAt = nextInvoiceAt;

                await existingSub.save();
                return existingSub;
            }

            // Fallback safety: if we somehow get an unknown status
            throw new ForbiddenException('Subscription state not allowed.');
        }

        // ---------- 6) No existing sub for this plan -> create fresh ----------
        const created = await this.subscriptionModel.create({
            user: userId,
            plan: new Types.ObjectId(dto.plan),
            status: 'init', // <- new subscription always starts at init
            startAt: now,
            billingPeriod,
            amount: plan.price,
            coupon: couponDoc ? couponDoc._id : null,
            discount,
            bankAccountName: dto.bankAccountName.trim(),
            tradingViewUsername: dto.tradingViewUsername,
            sn1p3rShotAccount: dto.sn1p3rShotAccount,
            riskManagerAccount: dto.riskManagerAccount,
            sn1p3rConceptAccount: dto.sn1p3rConceptAccount,
            nextInvoiceAt,
        } satisfies Partial<subscriptionSchema.SubscriptionDocument>);

        return created;
    }


    private addMonthsSafe(date: Date, months: number): Date {
        const d = new Date(date.getTime());
        const targetMonth = d.getMonth() + months;
        const targetYear = d.getFullYear() + Math.floor(targetMonth / 12);
        const month = ((targetMonth % 12) + 12) % 12;

        // Keep day where possible; clamp to end of month
        const day = Math.min(d.getDate(), daysInMonth(targetYear, month));
        return new Date(targetYear, month, day, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());

        function daysInMonth(year: number, monthZeroBased: number) {
            return new Date(year, monthZeroBased + 1, 0).getDate();
        }
    }

    async paginate(dto: SubscriptionsPaginateDto) {
        const page = Math.max(1, dto.page || 1);
        const limit = Math.min(100, Math.max(1, dto.limit || 20));

        // ---- Base filter ----
        const filter: FilterQuery<subscriptionSchema.SubscriptionDocument> = {};

        // status filter (exact match)
        if (dto.status) {
            const allowed: subscriptionSchema.SubscriptionStatus[] = [
                'init',
                'active',
                'past_due',
                'paused',
                'cancelled',
            ];
            if (!allowed.includes(dto.status)) {
                throw new BadRequestException('Invalid status');
            }
            filter.status = dto.status;
        }

        // We cannot directly "filter by populated field" with plain `filter`,
        // BUT mongoose-paginate-v2 will run `populate`, so:
        // strategy:
        //   - if there's a search term for firstName/lastName,
        //     we first find matching userIds, then filter by those IDs.

        if (dto.search && dto.search.trim() !== '') {
            const rx = new RegExp(escapeRegex(dto.search.trim()), 'i');

            // find users whose firstName OR lastName matches rx
            // we only select _id to keep it light
            // NOTE: We assume you have a User model registered as 'User'
            const matchingUsers = await (this.subscriptionModel.db
                .model('User') // <-- same name you used in @Prop({ ref: 'User' })
                .find({
                    $or: [
                        { firstName: rx },
                        { lastName: rx },
                    ],
                })
                .select('_id')
                .lean()
            );

            const userIds = matchingUsers.map(u => u._id);

            if (userIds.length === 0) {
                // no user matched the name => result is empty
                return {
                    items: [],
                    page,
                    limit,
                    total: 0,
                    totalPages: 0,
                    hasPrev: page > 1,
                    hasNext: false,
                };
            }

            // filter subscriptions by those users
            filter.user = { $in: userIds };
        }

        // ---- run paginate ----
        const result = await this.subscriptionModel.paginate(filter, {
            page,
            limit,
            sort: { createdAt: -1 },
            lean: true,
            leanWithId: true,
            populate: [
                {
                    path: 'user',
                    select: 'firstName lastName email photoURL',
                },
                {
                    path: 'plan',
                    select: 'title billingPeriod price product', // adjust what you want admin to see
                },
                {
                    path: 'coupon',
                    select: 'code discount', // optional
                },
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
    async getMySubscription(userId: string) {
        if (!userId || !Types.ObjectId.isValid(userId)) {
            throw new BadRequestException("Invalid user id");
        }

        const active = await this.subscriptionModel
            .find({
                user: new Types.ObjectId(userId),

            })
            .sort({ startAt: -1 }) // just in case more than 1
            .populate([
                {
                    path: "plan",
                    select: "title billingPeriod price",
                },
                {
                    path: "coupon",
                    select: "code discount",
                },
            ])
            .lean({ virtuals: true })
            .exec();

        if (active) {
            return active;
        }

        // fallback: last subscription of any status (maybe they canceled already)
        const latest = await this.subscriptionModel
            .findOne({
                user: new Types.ObjectId(userId),
            })
            .sort({ startAt: -1 })
            .populate([
                {
                    path: "plan",
                    select: "title billingPeriod price",
                },
                {
                    path: "coupon",
                    select: "code discount",
                },
            ])
            .lean({ virtuals: true })
            .exec();

        return latest || null;
    }

    async updatePartial(
        subId: string,
        dto: UpdateSubscriptionDto,
    ) {
        // validate subId
        if (!subId || !Types.ObjectId.isValid(subId)) {
            throw new BadRequestException('Invalid subscription id');
        }

        // Build $set only with provided keys
        const $set: Record<string, any> = {};

        if (dto.status !== undefined) {
            // sanity check: do not allow setting back to 'init' via this endpoint
            const allowed: subscriptionSchema.SubscriptionStatus[] = [
                'init',
                'active',
                'past_due',
                'paused',
                'cancelled',
            ];
            if (!allowed.includes(dto.status)) {
                throw new BadRequestException(
                    "Status can only be 'active', 'past_due', 'paused', or 'cancelled'"
                );
            }
            $set.status = dto.status;
        }

        if (dto.sn1p3rConceptKey !== undefined) {
            $set.sn1p3rConceptKey = dto.sn1p3rConceptKey?.trim();
        }

        if (dto.riskManagerKey !== undefined) {
            $set.riskManagerKey = dto.riskManagerKey?.trim();
        }

        if (dto.sn1p3rShotKey !== undefined) {
            $set.sn1p3rShotKey = dto.sn1p3rShotKey?.trim();
        }

        if (dto.noted !== undefined) {
            $set.noted = dto.noted?.trim();
        }

        if (Object.keys($set).length === 0) {
            throw new BadRequestException('No valid fields to update');
        }

        const updated = await this.subscriptionModel
            .findByIdAndUpdate(
                subId,
                { $set },
                {
                    new: true, // return updated doc
                    runValidators: true, // respect schema validators
                },
            )
            .populate([
                {
                    path: 'user',
                    select: 'firstName lastName email photoURL',
                },
                {
                    path: 'plan',
                    select: 'title billingPeriod price product',
                },
                {
                    path: 'coupon',
                    select: 'code discount',
                },
            ])
            .lean({ virtuals: true })
            .exec();

        if (!updated) {
            throw new NotFoundException('Subscription not found');
        }

        return updated;
    }
}
