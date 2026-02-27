import {
    Injectable,
    ConflictException,
    InternalServerErrorException,
    BadRequestException,
    NotFoundException,
    ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, PaginateOptions, PaginateResult, Types } from 'mongoose';
import * as indicatorSchema from './indicator.schema';
import { UpdateIndicatorAdminDto } from './dto/update-indicator-admin.dto';
import * as membershipsSchema from 'src/memberships/memberships.schema';
import { MembershipStatus } from 'src/memberships/memberships.schema';


@Injectable()
export class IndicatorService {
    constructor(
        @InjectModel(indicatorSchema.Indicator.name)
        private readonly indicatorModel: indicatorSchema.IndicatorPaginateModel,
        @InjectModel(membershipsSchema.Membership.name)
        private readonly membershipModel: membershipsSchema.MembershipPaginateModel,
    ) { }

    async requestIndicator(params: {
        userId: string | Types.ObjectId;
        username: string;
        notes?: string;
    }): Promise<indicatorSchema.IndicatorDocument> {
        const user =
            typeof params.userId === 'string'
                ? new Types.ObjectId(params.userId)
                : params.userId;

        const username = (params.username ?? '').trim();
        if (!username) {
            throw new ConflictException('username is required');
        }

        const membership = await this.membershipModel.findOne({ user }).lean();
        if (!membership || membership.status !== MembershipStatus.Verified) {
            throw new ForbiddenException('Please join membership first');
        }

        try {
            return await this.indicatorModel.findOneAndUpdate(
                { user },
                {
                    $setOnInsert: { user },
                    $set: {
                        username, // <-- added
                        status: indicatorSchema.IndicatorStatus.Request,
                        ...(params.notes !== undefined ? { notes: params.notes } : {}),
                    },
                },
                { new: true, upsert: true },
            );
        } catch (err: any) {
            if (err?.code === 11000) {
                return this.indicatorModel.findOne({ user }).orFail();
            }
            throw new InternalServerErrorException(err?.message ?? 'Request failed');
        }
    }

    async getMyIndicator(userId: string | Types.ObjectId): Promise<indicatorSchema.IndicatorDocument | null> {
        const user = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
        return this.indicatorModel.findOne({ user });
    }

    async paginate(query: {
        q?: string;
        status?: indicatorSchema.IndicatorStatus;
        page?: number;
        limit?: number;
    }): Promise<PaginateResult<indicatorSchema.IndicatorDocument>> {
        const { q, status, page = 1, limit = 20 } = query;

        const filter: FilterQuery<indicatorSchema.IndicatorDocument> = {};
        const or: FilterQuery<indicatorSchema.IndicatorDocument>[] = [];

        if (q && q.trim()) {
            const rx = new RegExp(this.escapeRegex(q.trim()), 'i');
            or.push({ username: rx }, { notes: rx });
        }

        if (or.length) {
            filter.$or = or;
        }

        if (status) {
            filter.status = status;
        }

        const options: PaginateOptions = {
            page: Number(page) || 1,
            limit: Number(limit) || 20,
            sort: { createdAt: -1 },
            lean: true,
            leanWithId: false,
            populate: [{ path: 'user', select: '_id email firstName lastName' }],
        };

        return this.indicatorModel.paginate(filter, options);
    }

    private escapeRegex(s: string) {
        return s.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
    }

    async updateAdmin(id: string, dto: UpdateIndicatorAdminDto, updatedBy?: string) {
        if (!Types.ObjectId.isValid(id)) {
            throw new BadRequestException('INVALID_ID');
        }

        const indicator = await this.indicatorModel.findById(id).exec();
        if (!indicator) {
            throw new NotFoundException('INDICATOR_NOT_FOUND');
        }

        if (dto.status !== undefined) {
            indicator.status = dto.status;
        }

        if (dto.adminNotes !== undefined) {
            indicator.adminNotes = dto.adminNotes?.trim() || undefined;
        }

        if (updatedBy && Types.ObjectId.isValid(updatedBy)) {
            indicator.updatedBy = new Types.ObjectId(updatedBy);
        }

        await indicator.save();
        return this.indicatorModel.findById(indicator._id).lean().exec();
    }

}
