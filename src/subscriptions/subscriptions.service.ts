import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Subscription, SubscriptionDocument } from './subscriptions.schema';

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectModel(Subscription.name)
    private readonly subscriptionModel: Model<SubscriptionDocument>,
  ) { }

  async getByUser(userId: string | Types.ObjectId) {
    if (!Types.ObjectId.isValid(String(userId))) {
      throw new BadRequestException('INVALID_USER_ID');
    }

    return this.subscriptionModel
      .find({ user: new Types.ObjectId(userId) })
      .populate('product', 'name pricing billingPeriod lifetime')
      .lean()
      .exec();
  }

  async getById(subscriptionId: string) {
    if (!Types.ObjectId.isValid(subscriptionId)) {
      throw new BadRequestException('INVALID_SUBSCRIPTION_ID');
    }

    const subscription = await this.subscriptionModel
      .findById(subscriptionId)
      .populate('product', 'name pricing billingPeriod note')
      .populate('user', '_id email firstName lastName')
      .lean()
      .exec();

    if (!subscription) {
      throw new NotFoundException('SUBSCRIPTION_NOT_FOUND');
    }

    return subscription;
  }

  async findByUserAndProduct(userId: string, productId: string) {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(productId)) {
      throw new BadRequestException('INVALID_ID');
    }

    const subscription = await this.subscriptionModel
      .findOne({
        user: new Types.ObjectId(userId),
        product: new Types.ObjectId(productId),
      })
      .lean()
      .exec();
    if (!subscription) {
      throw new NotFoundException('SUBSCRIPTION_NOT_FOUND');
    }

    return subscription;
  }

  async updateAdminNote(subscriptionId: string, note?: string) {
    if (!Types.ObjectId.isValid(subscriptionId)) {
      throw new BadRequestException('INVALID_SUBSCRIPTION_ID');
    }

    const updated = await this.subscriptionModel
      .findByIdAndUpdate(
        subscriptionId,
        { notes: note?.trim() || undefined },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();

    if (!updated) {
      throw new NotFoundException('SUBSCRIPTION_NOT_FOUND');
    }

    return updated;
  }
}
