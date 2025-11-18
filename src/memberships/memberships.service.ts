// memberships.service.ts
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, PaginateOptions, Types } from 'mongoose';
import * as membershipsSchema from './memberships.schema';
import { JoinMembershipDto } from './dto/join-membership.dto';
import { User, UserDocument } from 'src/user/user.schema';
import { PaginateMembershipsDto } from './dto/paginate-memberships.dto';
import { PaginatedResult } from 'src/common/types/api-response.type';
import { UpdateMembershipAdminDto } from './dto/update-membership-admin.dto';
import { buildAdminTinyPayload, normalizeAccounts } from './memberships.helper';
import { PushProducer } from 'src/queue/push.producer';
import { WebPushSubService } from 'src/web-push-sub/web-push-sub.service';
import { randomBytes } from 'crypto';
import { ActivateLicenseDto } from './dto/activate-license.dto';
import { JoseService } from './jose.service';
import { MembershipDocument } from './memberships.schema';
import { Referral } from './referral.schema';

export type ReferralWithOwner = Referral & {
    owner: Pick<User, 'firstName' | 'lastName'>;
};

export type MembershipWithReferralOwner = MembershipDocument & {
    referral?: ReferralWithOwner;
};


@Injectable()
export class MembershipsService {
    private readonly logger = new Logger(MembershipsService.name);
    constructor(
        @InjectModel(membershipsSchema.Membership.name)
        private readonly membershipModel: membershipsSchema.MembershipPaginateModel,
        @InjectModel(User.name)
        private readonly userModel: Model<UserDocument>,
        private readonly pushProducer: PushProducer,
        private readonly webPushSubService: WebPushSubService,
        private readonly jose: JoseService
    ) { }

    async findByUserId(userId: string): Promise<MembershipDocument | null> {
        const membership = await this.membershipModel
            .findOne({ user: new Types.ObjectId(userId) })
            .populate({
                path: 'user',
                select: '_id email firstName lastName',
            })
            .populate({
                path: 'referral',
                select: '_id code link owner',  // include whatever fields you need
                populate: {
                    path: 'owner',
                    select: '_id email firstName lastName',
                },
            })
            .exec();


        return membership;
    }



    async requestJoin(dto: JoinMembershipDto, currentUserId?: string) {
        if (!currentUserId) throw new BadRequestException('USER_REQUIRED');

        const user = await this.userModel.findById(currentUserId);

        // normalize email
        const emailRaw = dto.email;
        const email =
            typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : undefined;
        if (!email) throw new BadRequestException('EMAIL_REQUIRED');

        // normalize accounts as string[] (up to 10), then map to MembershipAccount[]
        const accountStrings = normalizeAccounts(dto.accounts);
        const accounts =
            (accountStrings ?? []).map((acc) => ({
                account: acc,
                isVerified: false, // default on creation
            })) ?? [];

        // Uniqueness: one per user OR one per email
        const ors: FilterQuery<membershipsSchema.MembershipDocument>[] = [
            { user: new Types.ObjectId(currentUserId) },
            { email },
        ];

        const existing = await this.membershipModel.findOne({ $or: ors }).lean();
        if (existing) {
            throw new ConflictException(
                'A membership for this user or email already exists.',
            );
        }

        try {
            const created = await this.membershipModel.create({
                user: new Types.ObjectId(currentUserId),
                email,
                accounts, // 👈 now MembershipAccount[]
                notes: dto.notes ?? undefined,
                status: membershipsSchema.MembershipStatus.Request,
                referral: new Types.ObjectId(dto.referral) ?? undefined, // validated MongoId string (or undefined)
            });

            // Push notification (unchanged)
            try {
                const tinyPayload = {
                    title: 'New membership request',
                    body: `${user?.firstName} ${user?.lastName} just asked to join`,
                };

                let excludeId: Types.ObjectId | null = null;
                const maybeAuthorId = (dto as any)?.authorId;
                if (maybeAuthorId) {
                    try {
                        excludeId = new Types.ObjectId(String(maybeAuthorId));
                    } catch {
                        /* ignore bad id */
                    }
                }

                const recipients = await this.webPushSubService.getAdminIds();

                if (recipients.length) {
                    await this.pushProducer.enqueueSendToUsers(recipients, tinyPayload, {
                        ttl: 3600,
                        chunkSize: 500,
                    });
                }
            } catch (e) {
                console.warn('[AnalyzeNews.create] push enqueue failed:', e);
            }

            return this.membershipModel.findById(created._id).lean();
        } catch (err: any) {
            if (err?.code === 11000) {
                throw new ConflictException(
                    'A membership for this user or email already exists.',
                );
            }
            throw err;
        }
    }

    async appeal(userId: string, dto: JoinMembershipDto) {
        const membership = await this.membershipModel
            .findOne({ user: new Types.ObjectId(userId) })
            .populate('user')
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

        const accountsProvided = Object.prototype.hasOwnProperty.call(
            dto,
            'accounts',
        );

        // normalize accounts as string[] then map to MembershipAccount[]
        const accountStrings = normalizeAccounts(dto.accounts);
        const accounts =
            (accountStrings ?? []).map((acc) => ({
                account: acc,
                isVerified: false, // on appeal you can reset or keep as false
            })) ?? [];

        const referralProvided = Object.prototype.hasOwnProperty.call(
            dto,
            'referral',
        );
        const referral = dto.referral; // validated MongoId string or undefined

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
            if (dup) {
                throw new ConflictException(
                    'A membership with this email already exists.',
                );
            }
            membership.email = email;
        }

        if (accountsProvided) {
            // replace accounts entirely with new MembershipAccount[]
            membership.accounts = accounts;
        }

        // ✅ Allow updating referral on appeal
        if (referralProvided) {
            if (referral) {
                membership.referral = referral as any; // Mongoose will cast string -> ObjectId
            } else {
                membership.referral = undefined;
            }
        }

        if (Object.prototype.hasOwnProperty.call(dto, 'notes')) {
            membership.notes = dto.notes?.trim() || undefined;
        }

        // Reset status/admin note for re-review
        membership.status = membershipsSchema.MembershipStatus.Request;
        membership.adminNotes = undefined;

        try {
            try {
                const tinyPayload = {
                    title: 'Appeal membership request',
                    body: `${membership?.user?.firstName} ${membership?.user?.lastName} just asked to Appeal`,
                };

                let excludeId: Types.ObjectId | null = null;
                const maybeAuthorId = (dto as any)?.authorId;

                if (maybeAuthorId) {
                    try {
                        excludeId = new Types.ObjectId(String(maybeAuthorId));
                    } catch {
                        /* ignore bad id */
                    }
                }

                const recipients = await this.webPushSubService.getAdminIds();

                if (recipients.length) {
                    await this.pushProducer.enqueueSendToUsers(recipients, tinyPayload, {
                        ttl: 3600,
                        chunkSize: 500,
                    });
                }
            } catch (e) {
                console.warn('[AnalyzeNews.create] push enqueue failed:', e);
            }

            await membership.save();

            return this.membershipModel.findById(membership._id).lean().exec();
        } catch (err: any) {
            if (err?.code === 11000) {
                throw new ConflictException(
                    'A membership with this email already exists.',
                );
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

        // 👇 handle accounts from DTO
        if (dto.accounts !== undefined) {
            // if you want to *replace* all accounts:
            membership.accounts = (dto.accounts || [])
                // optional: drop entries without a valid account string
                .filter((a) => a && a.account && a.account.trim().length > 0)
                .map((a) => ({
                    account: a.account.trim(),
                    isVerified: a.isVerified ?? false,
                }));
        }

        try {
            const tinyPayload = buildAdminTinyPayload(membership, dto, { maxReasonLength: 160 });
            const userId = membership?.user || '';
            const recipients = [new Types.ObjectId(userId?.toString())];

            if (recipients.length) {
                await this.pushProducer.enqueueSendToUsers(
                    recipients,
                    tinyPayload,
                    { ttl: 3600, chunkSize: 500 },
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

        try {
            const userId = membership.user;

            if (userId) {
                const recipientId = new Types.ObjectId(userId.toString());

                const tinyPayload = {
                    title: 'License key created',
                    body: 'Your EA license key has been generated and is now active.',
                    // optionally include a masked key so you don’t leak full license:
                    // body: `Your EA license key has been created: ${key.slice(0, 4)}***`,
                };

                const recipients = [recipientId];

                await this.pushProducer.enqueueSendToUsers(
                    recipients,
                    tinyPayload,
                    { ttl: 3600, chunkSize: 100 },
                );
            }
        } catch (e) {
            this.logger.warn(
                '[Memberships.createLicenseKeyForMembership] push enqueue failed:',
                e,
            );
        }
        // Return a lean object with the new licenseKey
        return this.membershipModel.findById(membership._id).lean().exec();
    }

    // -------- ACTIVATION FOR MT5 EA --------
    private deny(
        reason: string,
        context?: { maskedKey?: string; accountLogin?: string | number; ip?: string; ua?: string; membershipId?: string },
    ): never {
        this.logger.warn(
            `Activation denied: ${reason} | key=${context?.maskedKey ?? 'N/A'} | account=${context?.accountLogin ?? 'N/A'} | ip=${context?.ip ?? 'N/A'}`,
        );
        throw new ForbiddenException({ status: 'INVALID', reason });
    }

    async activate(dto: ActivateLicenseDto, ip?: string, ua?: string) {
        const key = dto.key?.trim();
        const maskedKey = key ? `${key.slice(0, 4)}***` : undefined; // don't log full key

        // Initial attempt log
        this.logger.log(
            `Activation attempt | key=${maskedKey ?? 'N/A'} | account=${dto.accountLogin} | ip=${ip ?? 'N/A'}`,
        );

        if (!key) this.deny('key_required', { maskedKey, accountLogin: dto.accountLogin, ip, ua });

        const membership = await this.membershipModel
            .findOne({ licenseKey: key })
            .populate('user', '_id email firstName lastName')
            .exec();

        if (!membership) this.deny('not_found', { maskedKey, accountLogin: dto.accountLogin, ip, ua });

        // ✅ EXPLICIT CHECK: Only allow Active and Verified statuses
        const allowedStatuses = [
            membershipsSchema.MembershipStatus.Verified
        ];

        if (!allowedStatuses.includes(membership.status)) {
            // Log the actual status for debugging
            this.logger.warn(
                `Activation denied: invalid status | status=${membership.status} | key=${maskedKey} | account=${dto.accountLogin}`,
            );

            // Return specific error based on status
            if (membership.status === membershipsSchema.MembershipStatus.Request) {
                this.deny('pending', { maskedKey, accountLogin: dto.accountLogin, ip, ua, membershipId: String(membership._id) });
            } else if (membership.status === membershipsSchema.MembershipStatus.Rejected) {
                this.deny('rejected', { maskedKey, accountLogin: dto.accountLogin, ip, ua, membershipId: String(membership._id) });
            } else if (membership.status === membershipsSchema.MembershipStatus.Ended) {
                this.deny('ended', { maskedKey, accountLogin: dto.accountLogin, ip, ua, membershipId: String(membership._id) });
            } else {
                this.deny('membership_not_active', { maskedKey, accountLogin: dto.accountLogin, ip, ua, membershipId: String(membership._id) });
            }
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
            ua,
        };

        const { token } = await this.jose.signToken(payload);

        // Success log
        this.logger.log(
            `Activation success | membershipId=${membershipId} | userId=${userId ?? 'N/A'} | account=${dto.accountLogin} | ip=${ip ?? 'N/A'}`,
        );

        // 🔥 RETURN EA-SAFE JSON
        return {
            status: 'OK',
            token: token,
        };
    }

}
