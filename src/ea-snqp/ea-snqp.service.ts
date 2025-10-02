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

@Injectable()
export class EaSnqpService {
    constructor(
        @InjectModel(EaSnqp.name)
        private readonly model: Model<EaSnqpDocument>,
    ) { }

    private ensureUser(id?: string) {
        if (!id || !isValidObjectId(id)) {
            throw new BadRequestException('user is invalid');
        }
    }

    async requestSnqp(currentUserId: string, body: RequestSnqpDto) {
        this.ensureUser(currentUserId);

        // Optional duplicate guard: (user + tradingAccount) for Request/Verified
        const dupFilter: FilterQuery<EaSnqpDocument> = {
            user: new Types.ObjectId(currentUserId),
            status: { $in: [MembershipStatus.Request, MembershipStatus.Verified] },
        };
        if (body.tradingAccount) dupFilter.tradingAccount = body.tradingAccount;

        const dup = await this.model.exists(dupFilter);
        if (dup) {
            throw new BadRequestException(
                'You already have a pending/active SNQP for this trading account.',
            );
        }

        const created = await this.model.create({
            user: new Types.ObjectId(currentUserId),
            tradingAccount: body.tradingAccount || undefined,
            accountNumbers: body.accountNumbers ?? [],
            bankAccount: body.bankAccount || undefined,
            status: MembershipStatus.Request,
        });

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

}
