// src/license-requests/license-request.service.ts
import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
    ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { FilterQuery, PaginateModel, PaginateResult } from 'mongoose';
import { Types } from 'mongoose';
import { LicenseRequest, LicenseRequestDocument } from './license-request.schema';
import { CreateLicenseRequestDto } from './dto/create-license-request.dto';
import { AdminUpdateLicenseRequestDto } from './dto/admin-update-license-request.dto';
import { LicenseRequestsPaginateDto } from './dto/license-requests-paginate.dto';
import { MembershipStatus } from 'src/referrals/memberships.enum';
import { WebPushSubService } from 'src/web-push-sub/web-push-sub.service';
import { Role } from 'src/user/user.enum';
import { Membership, MembershipDocument, } from 'src/referrals/memberships.schema';

function escapeRegex(str: string) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildLicensePush(status: MembershipStatus, note?: string) {
    switch (status) {
        case MembershipStatus.Verified:
            return {
                title: 'License approved ✅',
                body: 'Your license request has been approved.',
            };
        case MembershipStatus.Rejected:
            return {
                title: 'License request rejected ❌',
                body: note?.trim()
                    ? `Reason: ${note.trim().slice(0, 140)}`
                    : 'Your license request was not approved.',
            };
        case MembershipStatus.Ended:
            return {
                title: 'License ended 🔚',
                body: note?.trim()
                    ? `Note: ${note.trim().slice(0, 140)}`
                    : 'Your license has ended.',
            };
        case MembershipStatus.Request:
        default:
            return {
                title: 'License request under review 🕒',
                body: 'Your request is being reviewed.',
            };
    }
}

@Injectable()
export class LicenseRequestService {
    constructor(
        @InjectModel(LicenseRequest.name)
        private readonly model: PaginateModel<LicenseRequestDocument>,
        @InjectModel(Membership.name)
        private readonly membershipModel: PaginateModel<MembershipDocument>,
        private readonly push: WebPushSubService,
    ) { }

    async requestLicense(userId: Types.ObjectId, dto: CreateLicenseRequestDto) {

        const verifiedExists = await this.membershipModel.exists({
            user: new Types.ObjectId(userId),
            status: MembershipStatus.Verified,
        });
        if (!verifiedExists) {
            throw new ForbiddenException('You need a verified membership to request a license.');
        }

        const existing = await this.model.findOne({ user: new Types.ObjectId(userId) }).lean().exec();
        if (existing) {
            throw new ConflictException('You can only submit one license request.');
        }

        const doc = await this.model.create({
            user: new Types.ObjectId(userId),
            accountRiskManager: dto.accountRiskManager ?? '',
            accountSn1p3rConcept: dto.accountSn1p3rConcept ?? '',
            accountSn1p3rShot: dto.accountSn1p3rShot ?? '',
            bankAccountName: dto.bankAccountName,
            tradingViewUsername: dto.tradingViewUsername,
            notes: dto.notes ?? '',
            status: MembershipStatus.Request,
        });

        // notify admins/creators
        void this.push.sendToRoles(
            [Role.Admin, Role.Creator],
            {
                title: 'New license request!',
                body: 'A user submitted a new license request.',
                ts: Date.now(),
                type: 'license_request',
            },
            60,
        );

        return doc;
    }

    async myLicenseRequest(currentUserId: Types.ObjectId) {

        return this.model
            .findOne({ user: new Types.ObjectId(currentUserId) })
            .select(
                'accountRiskManager accountSn1p3rConcept accountSn1p3rShot bankAccountName tradingViewUsername notes status licenseRiskManager licenseSn1p3rConcept licenseSn1p3rShot createdAt adminNotes approvedAt approvedBy',
            )
            .populate({ path: 'approvedBy', select: 'firstName lastName email' })
            .lean({ virtuals: true })
            .exec();
    }


    async adminUpdateById(id: Types.ObjectId, dto: AdminUpdateLicenseRequestDto) {

        if (!dto || Object.keys(dto).length === 0) {
            throw new BadRequestException('Nothing to update');
        }

        const ops: any = { $set: {} as Record<string, any> };

        // Admin notes
        if (dto.adminNotes !== undefined) ops.$set.adminNotes = dto.adminNotes;

        // License keys
        if (dto.licenseRiskManager !== undefined)
            ops.$set.licenseRiskManager = dto.licenseRiskManager;

        if (dto.licenseSn1p3rConcept !== undefined)
            ops.$set.licenseSn1p3rConcept = dto.licenseSn1p3rConcept;

        if (dto.licenseSn1p3rShot !== undefined)
            ops.$set.licenseSn1p3rShot = dto.licenseSn1p3rShot;

        // Status (no approvedBy/approvedAt handling here)
        if (dto.status !== undefined) {
            ops.$set.status = dto.status;
        }

        const updated = await this.model.findByIdAndUpdate(id, ops, {
            new: true,
            runValidators: true,
        });

        if (!updated) throw new NotFoundException('License request not found');

        const { title, body } = buildLicensePush(updated.status, dto.adminNotes);
        const targetUserId =
            typeof updated.user === 'string'
                ? updated.user
                : (updated.user as unknown as Types.ObjectId).toString();

        await this.push.sendToUser(targetUserId, {
            title,
            body,
            url: `/license-requests/${updated._id}`,
            ts: Date.now(),
            type: 'license_update',
            status: updated.status,
        });

        return updated;
    }

    async updateMyRequest(requestId: string, dto: CreateLicenseRequestDto) {

        const existing = await this.model
            .findById(requestId)
            .select('_id user status')
            .lean()
            .exec();

        console.log("dto?.accountSn1p3rShot", dto?.accountSn1p3rShot)
        if (!existing) throw new NotFoundException('License request not found');
        await this.model.findByIdAndUpdate(
            requestId,
            {
                accountRiskManager: dto?.accountRiskManager || "",
                accountSn1p3rConcept: dto?.accountSn1p3rConcept || "",
                accountSn1p3rShot: dto?.accountSn1p3rShot || "",
                bankAccountName: dto?.bankAccountName,
                tradingViewUsername: dto?.tradingViewUsername,
                notes: dto?.notes,
                status: MembershipStatus.Request,
            },
        );

        void this.push.sendToRoles(
            [Role.Admin, Role.Creator],
            {
                title: 'License request updated',
                body: 'A user updated their license request.',
                ts: Date.now(),
                type: 'license_request',
            },
            60,
        );

        return { ok: true };
    }

    async paginate(dto: LicenseRequestsPaginateDto) {
        const page = Math.max(1, dto.page || 1);
        const limit = Math.min(100, Math.max(1, dto.limit || 20));

        const filter: FilterQuery<LicenseRequestDocument> = {};

        if (dto.status) {
            if (!Object.values(MembershipStatus).includes(dto.status)) {
                throw new BadRequestException('Invalid status');
            }
            filter.status = dto.status;
        }

        if (dto.search) {
            const rx = new RegExp(escapeRegex(dto.search), 'i');
            filter.$or = [{ bankAccountName: rx }, { tradingViewUsername: rx }];
        }

        const result: PaginateResult<LicenseRequestDocument> = await this.model.paginate(filter, {
            page,
            limit,
            sort: { createdAt: -1 },
            lean: true,
            leanWithId: true,
            populate: [
                { path: 'user', select: 'firstName lastName photoURL' },
                { path: 'approvedBy', select: 'firstName lastName email' },
            ],
        });

        const items = await Promise.all(result.docs.map(async res => {
            const membership = await this.membershipModel.findOne({ user: res?.user })
            return {
                ...res,
                membershipEmail: membership?.email
            }
        }))

        return {
            items,
            page: result.page ?? page,
            limit: result.limit ?? limit,
            total: result.totalDocs,
            totalPages: result.totalPages,
            hasPrev: result.hasPrevPage,
            hasNext: result.hasNextPage,
        };
    }
}
