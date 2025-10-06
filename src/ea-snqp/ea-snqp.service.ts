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

function toIdString(id: string | Types.ObjectId): string {
  return typeof id === 'string' ? id : (id as Types.ObjectId).toString();
}

function buildSnqpPush(status: MembershipStatus, opts?: { license?: string; reason?: string }) {
  switch (status) {
    case MembershipStatus.Verified:
      return {
        title: 'License verified ✅',
        body: opts?.license ? `Your license key: ${opts.license}` : 'Your license request was approved.',
        type: 'license_verified' as const,
      };
    case MembershipStatus.Rejected:
      return {
        title: 'License request rejected ❌',
        body: opts?.reason?.trim()
          ? `Reason: ${opts.reason.trim().slice(0, 140)}`
          : 'Your license request was not approved.',
        type: 'license_rejected' as const,
      };
    case MembershipStatus.Request:
    default:
      return {
        title: 'License request received 🕒',
        body: 'Your request is being reviewed by our team.',
        type: 'license_request_ack' as const,
      };
  }
}

@Injectable()
export class EaSnqpService {
  constructor(
    @InjectModel(EaSnqp.name)
    private readonly model: Model<EaSnqpDocument>,
    private readonly push: WebPushSubService,
  ) {}

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
      throw new BadRequestException('You already have a pending request the license!');
    }

    const created = await this.model.create({
      user: new Types.ObjectId(currentUserId),
      accountNumbers: body.accountNumbers ?? [],
      bankAccount: body.bankAccount || undefined,
      tradingView: body.tradingView || undefined,
      status: MembershipStatus.Request,
    });

    // Notify admins/creators (broadcast), excluding requester
    void this.push.sendToRoles(
      [Role.Admin, Role.Creator],
      {
        title: `License request!`,
        body: 'New license request submitted.',
        ts: Date.now(),
        type: 'license_request',
      },
      60,
      new Types.ObjectId(currentUserId),
    );

    // ✅ Acknowledge to the requester (single user)
    void this.push.sendToUser(toIdString(created.user), {
      ...buildSnqpPush(MembershipStatus.Request),
      url: `/licenses/${created._id}`,
      ts: Date.now(),
    });

    return this.model.findById(created._id).lean().exec();
  }

  async mySnqp(userId: string, status?: MembershipStatus) {
    const filter: any = { user: new Types.ObjectId(userId) };
    if (status) filter.status = status;
    const rows = await this.model
      .find(filter)
      .sort({ createdAt: -1 })
      .select('+licenseKey') // read it server-side
      .lean()
      .exec();

    const items = rows.map((r: any) => {
      const license =
        r.status === 'Verified' && r.licenseKey ? r.licenseKey : 'No license Key Verified!';
      delete r.licenseKey;
      return { ...r, license };
    });
    return items;
  }

  async getAll(dto: GetAllSnqpDto) {
    const page = Math.max(1, dto.page ?? 1);
    const limit = Math.min(100, Math.max(1, dto.limit ?? 20));
    const skip = (page - 1) * limit;

    const match: any = {};
    if (dto.status) match.status = dto.status;
    if (dto.userId) match.user = new Types.ObjectId(dto.userId);

    const searchRegex = dto.q?.trim()
      ? new RegExp(this.escapeRegex(dto.q.trim()), 'i')
      : null;

    const pipeline: any[] = [
      { $match: match },
      {
        $lookup: {
          from: 'users',
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
          meta: [{ $count: 'total' }],
        },
      },
    );

    const res = await this.model.aggregate(pipeline).allowDiskUse(true).exec();
    const items = res?.[0]?.items ?? [];
    const total = res?.[0]?.meta?.[0]?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return { items, page, limit, total, totalPages };
  }

  async updateStatus(id: string, dto: UpdateSnqpStatusDto) {
    if (!isValidObjectId(id)) throw new BadRequestException('invalid id');

    if (![MembershipStatus.Verified, MembershipStatus.Rejected].includes(dto.status)) {
      throw new BadRequestException('Only "Verified" or "Rejected" status is allowed.');
    }

    const license = (dto.license ?? '').trim();
    if (dto.status === MembershipStatus.Verified && !license) {
      throw new BadRequestException('license is required to verify.');
    }

    const doc = await this.model.findById(id).lean().exec();
    if (!doc) throw new NotFoundException('License request not found');

    try {
      await this.model.updateOne(
        { _id: id },
        {
          $set: {
            status: dto.status,
            licenseKey: dto.status === MembershipStatus.Verified ? license : '',
          },
        },
        { runValidators: true },
      );
    } catch (e: any) {
      if (e?.code === 11000 && e?.keyPattern?.licenseKey) {
        throw new BadRequestException('This license key is already in use.');
      }
      throw e;
    }

    const updated = await this.model.findById(id).select('+licenseKey').lean().exec();
    if (!updated) throw new NotFoundException('License request not found after update');

    // ✅ Notify the requester (single user) about the result
    const payload = buildSnqpPush(dto.status, {
      license: updated.status === MembershipStatus.Verified ? updated.licenseKey : undefined,
      reason: "",
    });

    await this.push.sendToUser(toIdString(doc.user), {
      ...payload,
      url: `/licenses/${id}`,
      ts: Date.now(),
      status: updated.status,        // optional for client UI
      license: updated.status === MembershipStatus.Verified ? updated.licenseKey : undefined,
    });

    const safe = {
      _id: updated._id,
      accountNumbers: updated.accountNumbers,
      bankAccount: updated.bankAccount,
      status: updated.status,
      issueDate: updated.issueDate,
      expiryDate: updated.expiryDate,
      license: updated.status === MembershipStatus.Verified ? (updated.licenseKey ?? '') : '',
      user: doc.user,
    };

    return safe;
  }

  private escapeRegex(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
