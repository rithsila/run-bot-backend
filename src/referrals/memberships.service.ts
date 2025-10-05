// src/memberships/memberships.service.ts
import {
    BadRequestException,
    ConflictException,
    Injectable,
    InternalServerErrorException,
    NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types, isValidObjectId } from 'mongoose';
import { Referral, ReferralDocument } from './referrals.schema';
import { Membership, MembershipDocument } from './memberships.schema';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { MembershipStatus } from './memberships.enum';
@Injectable()
export class MembershipsService {
    constructor(
        @InjectModel(Membership.name) private readonly membershipModel: Model<MembershipDocument>,
        @InjectModel(Referral.name) private readonly referralModel: Model<ReferralDocument>,
    ) { }

    private ensureId(id?: string, name = 'id') {
        if (!id || !isValidObjectId(id)) throw new BadRequestException(`${name} is invalid`);
    }

    async requestJoin(userId: string, dto: CreateMembershipDto) {
        const referral = await this.referralModel.findById(dto.referral).select('_id').lean();
        if (!referral) throw new NotFoundException('Referral not found');

        try {
            const doc = await this.membershipModel.create({
                email: dto.email,
                user: new Types.ObjectId(userId),
                referral: new Types.ObjectId(dto.referral),
                accountNumbers: dto.accountNumbers,
                tradingAccount: dto.tradingAccount,
                notes: dto.notes,
                status: MembershipStatus.Request,
            });
            return doc;
        } catch (err: any) {
            if (err?.code === 11000) {
                throw new ConflictException('This user already has a membership for this referral.');
            }
            throw err;
        }
    }

    async myMemberships(currentUserId: string) {
        this.ensureId(currentUserId, 'user');

        return this.membershipModel
            .find({ user: currentUserId })
            .populate([
                { path: 'user', select: 'firstName lastName email' },
                {
                    path: 'referral',
                    select: 'partnerCode registerUrl', // add fields you need from Referral
                    populate: [
                        { path: 'broker', select: 'name logo description' },
                        { path: 'user', select: 'firstName lastName email' },
                    ],
                },
            ])
            .lean()
            .exec();
    }


    async findAll(query: {
        page?: number | string;
        limit?: number | string;
        status?: MembershipStatus | string;
        broker?: string;
        user?: string;
        includePartnerCode?: '1' | 'true';
    }) {
        const page = Math.max(1, Number(query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

        const filter: FilterQuery<MembershipDocument> = {};
        if (query.status && Object.values(MembershipStatus).includes(query.status as MembershipStatus)) {
            filter.status = query.status as MembershipStatus;
        }
        if (query.broker) {
            this.ensureId(query.broker, 'broker');
            filter.broker = query.broker;
        }
        if (query.user) {
            this.ensureId(query.user, 'user');
            filter.user = query.user;
        }

        const q = this.membershipModel
            .find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate([
                { path: 'user', select: 'firstName lastName email' },
                {
                    path: 'referral',
                    select: 'partnerCode registerUrl', // add fields you need from Referral
                    populate: [
                        { path: 'broker', select: 'name logo description' },
                        { path: 'user', select: 'firstName lastName email' },
                    ],
                },
            ])

        // partnerCode is select:false by default; include only when explicitly asked
        if (query.includePartnerCode === '1' || query.includePartnerCode === 'true') {
            q.select('+partnerCode');
        }

        const [data, total] = await Promise.all([q.lean().exec(), this.membershipModel.countDocuments(filter)]);
        return {
            data,
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
        };
    }

    async updateStatus(
        membershipId: string,
        status: MembershipStatus,
    ) {

        if (!Object.values(MembershipStatus).includes(status)) {
            throw new BadRequestException('Invalid membership status');
        }

        await this.membershipModel.findByIdAndUpdate(membershipId, { status });

    }

}