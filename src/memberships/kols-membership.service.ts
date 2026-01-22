import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import * as membershipsSchema from './memberships.schema';
import { KolsJoinMembershipDto } from './dto/kols-join-membership.dto';
import { normalizeAccounts } from './memberships.helper';
import { Referral, ReferralDocument } from './referral.schema';

@Injectable()
export class KolsMembershipService {
    private readonly logger = new Logger(KolsMembershipService.name);

    constructor(
        @InjectModel(membershipsSchema.Membership.name)
        private readonly membershipModel: membershipsSchema.MembershipPaginateModel,
        @InjectModel(Referral.name)
        private readonly referralModel: Model<ReferralDocument>
    ) { }

    async findByUserId(userId: string) {
        if (!Types.ObjectId.isValid(userId)) {
            throw new BadRequestException('INVALID_USER');
        }

        return this.membershipModel
            .findOne({ user: new Types.ObjectId(userId) })
            .lean()
            .exec();
    }

    async requestJoin(dto: KolsJoinMembershipDto){
        
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
                isVerified: false,
            })) ?? [];

        // Uniqueness: one per user OR one per email
        const ors: FilterQuery<membershipsSchema.MembershipDocument>[] = [
            { email },
        ];

        const existing = await this.membershipModel.findOne({ $or: ors }).lean();
        if (existing) {
            throw new ConflictException(
                'A membership for this user or email already exists.',
            );
        }

        const referralId = dto.referral
            ? (Types.ObjectId.isValid(dto.referral) ? new Types.ObjectId(dto.referral) : null)
            : undefined;
        if (dto.referral && !referralId) {
            throw new BadRequestException('INVALID_REFERRAL');
        }
        if (referralId) {
            const referralExists = await this.referralModel.exists({ _id: referralId }).exec();
            if (!referralExists) throw new NotFoundException('REFERRAL_NOT_FOUND');
        }

        try {
            const created = await this.membershipModel.create({
                user: new Types.ObjectId(),
                email,
                accounts,
                notes: dto.notes,
                status: membershipsSchema.MembershipStatus.Request,
                referral: referralId ?? undefined,
            });

            return { userId: created.user?.toString?.() ?? created.user };
        } catch (err: any) {
            if (err?.code === 11000) {
                throw new ConflictException(
                    'A membership for this user or email already exists.',
                );
            }
            throw err;
        }
    }
}
