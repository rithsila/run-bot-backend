import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Subscription, SubscriptionDocument } from './subscriptions.schema';

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectModel(Subscription.name)
    private readonly subscriptionModel: Model<SubscriptionDocument>,
  ) {}

  async getByUser(userId: string | Types.ObjectId) {
    if (!Types.ObjectId.isValid(String(userId))) {
      throw new BadRequestException('INVALID_USER_ID');
    }

    return this.subscriptionModel
      .find({ user: new Types.ObjectId(userId) })
      .populate('product', 'name pricing billingPeriod')
      .lean()
      .exec();
  }
}
