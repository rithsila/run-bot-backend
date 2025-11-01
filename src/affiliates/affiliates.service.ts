// src/affiliates/affiliates.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AffiliatesStatus, Role } from 'src/user/user.enum';
import { User, UserDocument } from 'src/user/user.schema';
import { WebPushSubService } from 'src/web-push-sub/web-push-sub.service';

@Injectable()
export class AffiliatesService {
    constructor(
        @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
        private readonly push: WebPushSubService,
    ) { }

    async getByUserId(userId: Types.ObjectId) {
        const user = await this.userModel
            .findById(userId)
            .select('affiliates')
            .lean();
        if (!user) throw new NotFoundException('User not found');

        return user.affiliates ?? null
    }

    async request(_id: Types.ObjectId) {

        const user = await this.userModel.findById(_id).select('+email +emailCanonical').lean(false);
        if (!user) throw new NotFoundException('User not found');

        switch (user.affiliates) {
            case AffiliatesStatus.Request:
                throw new BadRequestException('You already requested affiliates membership.');
            case AffiliatesStatus.Verified:
                throw new BadRequestException('You are already an affiliate.');
            default:
                user.affiliates = AffiliatesStatus.Request;
                await user.save();
        }


        void this.push.sendToRoles(
            [Role.Admin, Role.Creator],
            {
                title: 'New affiliates request!',
                body: 'A user submitted a new affiliates request.',
                ts: Date.now(),
                type: 'affiliates_request',
            },
            60,
        );

        // Return a minimal payload

        const { _id: id, firstName, lastName, email, affiliates } = user.toObject();
        return { id, firstName, lastName, email, affiliates };
    }

    async toggleAffiliates(userId: Types.ObjectId) {
        const _id = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;

        const updated = await this.userModel.findOneAndUpdate(
            { _id },
            [
                {
                    $set: {
                        affiliates: {
                            $switch: {
                                branches: [
                                    { case: { $eq: ['$affiliates', AffiliatesStatus.Verified] }, then: AffiliatesStatus.Rejected },
                                    { case: { $eq: ['$affiliates', AffiliatesStatus.Rejected] }, then: AffiliatesStatus.Verified },
                                ],
                                // if Request/Ended/undefined -> set to Verified
                                default: AffiliatesStatus.Verified,
                            },
                        },
                    },
                },
            ],
            { new: true, lean: true },
        );

        if (!updated) throw new NotFoundException('User not found');
        return updated;
    }
}
