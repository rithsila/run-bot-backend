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
import { buildAdminTinyPayload, normalizeAccounts } from './memberships.helper';
import { PushProducer } from 'src/queue/push.producer';
import { WebPushSubService } from 'src/web-push-sub/web-push-sub.service';
import { Subscription } from 'src/subscription/subscription.schema';
import { randomBytes } from 'crypto';
import { ActivateLicenseDto } from './dto/activate-license.dto';
import { JoseService } from './jose.service';

@Injectable()
export class MembershipsService {
    
    constructor(
        @InjectModel(membershipsSchema.Membership.name)
        private readonly membershipModel: membershipsSchema.MembershipPaginateModel,
        @InjectModel(User.name)
        private readonly userModel: Model<UserDocument>,
        @InjectModel(Subscription.name)
        private readonly pushProducer: PushProducer,
        private readonly webPushSubService: WebPushSubService,
        private readonly jose: JoseService
    ) { }

    async findByUserId(userId: string): Promise<MembershipDocument | null> {

        return this.membershipModel.findOne({ user: new Types.ObjectId(userId) }).exec();
    }

    async requestJoin(dto: JoinMembershipDto, currentUserId?: string) {
        // user is required (schema requires it)
        if (!currentUserId) throw new BadRequestException('USER_REQUIRED');

        const user = await this.userModel.findById(currentUserId)
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
                referral: dto?.referral
            });


            try {
                const tinyPayload = {
                    title: 'New membership request',
                    body: `${user?.firstName} ${user?.lastName} just asked to join`,
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
            // --

            return this.membershipModel.findById(created._id).lean();


        } catch (err: any) {
            if (err?.code === 11000) {
                // unique index collision (race)
                throw new ConflictException('A membership for this user or email already exists.');
            }
            throw err;
        }
    }

    async appeal(userId: string, dto: JoinMembershipDto) {
        const membership = await this.membershipModel
            .findOne({ user: new Types.ObjectId(userId) }).populate('user')
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
        const referral = dto?.referral

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
        membership.referral = referral;

        try {
            try {
                const tinyPayload = {
                    title: 'Appeal membership request',
                    body: `${membership?.user?.firstName} ${membership?.user?.lastName} just asked to Appeal`,
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
        try {
            const tinyPayload = buildAdminTinyPayload(membership, dto, { maxReasonLength: 160 });
            const userId = membership?.user || ''
            const recipients = [new Types.ObjectId(userId?.toString())];
            if (recipients.length) {
                await this.pushProducer.enqueueSendToUsers(
                    recipients,
                    tinyPayload,
                    { ttl: 3600, chunkSize: 500 }
                );
            }
        } catch (e) {
            console.warn('[Membership.updateAdmin] push enqueue failed:', e);
        }

        await membership.save();
        return this.membershipModel.findById(membership._id).lean().exec();
    }

    private generateLicenseKey(membership: membershipsSchema.MembershipDocument): string {
        // Prefix can be anything: product ID, "EA", etc.
        const prefix = 'EA';
        const randomPart = randomBytes(6).toString('base64url').toUpperCase(); // short but random
        // You can also mix in part of email or user id if you want
        return `${prefix}-${randomPart}`;
    }

    // 👇 MAIN: create and attach a license key to a membership
    async createLicenseKeyForMembership(id: string) {
        if (!Types.ObjectId.isValid(id)) {
            throw new BadRequestException('INVALID_ID');
        }

        const membership = await this.membershipModel.findById(id).exec();
        if (!membership) {
            throw new NotFoundException('MEMBERSHIP_NOT_FOUND');
        }

        if (membership.licenseKey) {
            // already has a key, don't overwrite silently
            throw new ConflictException('LICENSE_ALREADY_EXISTS');
        }

        const key = this.generateLicenseKey(membership);
        membership.licenseKey = key;

        await membership.save();

        // Return a lean object with the new licenseKey
        return this.membershipModel.findById(membership._id).lean().exec();
    }

    // -------- ACTIVATION FOR MT5 EA --------

    private deny(reason: string): never {
        throw new ForbiddenException({ status: 'INVALID', reason });
    }

    async activate(dto: ActivateLicenseDto, ip?: string, ua?: string) {
        const key = dto.key?.trim();
        if (!key) this.deny('key_required');

        const membership = await this.membershipModel
            .findOne({ licenseKey: key })
            .populate('user', '_id email firstName lastName')
            .exec();

        if (!membership) this.deny('not_found');
        if (membership.status === membershipsSchema.MembershipStatus.Request) this.deny('pending');
        if (membership.status === membershipsSchema.MembershipStatus.Rejected) this.deny('rejected');
        if (membership.status === membershipsSchema.MembershipStatus.Ended) this.deny('ended');

        // Validate account
        const accounts = membership.accounts ?? [];
        const loginStr = String(dto.accountLogin);
        if (accounts.length > 0 && !accounts.includes(loginStr)) {
            this.deny('account_not_allowed');
        }

        // Build token payload
        const membershipId = (membership._id as Types.ObjectId).toHexString();
        const userId = (membership.user as any)?._id?.toString?.();

        const payload = {
            sub: `membership:${membershipId}`,
            membershipId,
            licenseKey: membership.licenseKey,
            accountLogin: dto.accountLogin,
            email: membership.email,
            userId,
            ip,
            ua
        };

        const { token } = await this.jose.signToken(payload);

        // 🔥 RETURN EA-SAFE JSON
        return {
            status: "OK",
            token: token
        };
    }

}
