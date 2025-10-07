// src/TabBars/tab-flags.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TabBarId } from './tab-flags.enum';
import { TabBar, TabBarDocument } from './tab-flags.schema';

@Injectable()
export class TabFlagsService {
  constructor(@InjectModel(TabBar.name) private readonly model: Model<TabBarDocument>) {}

  private ensureId(id: string | Types.ObjectId, field = 'id') {
    if (id instanceof Types.ObjectId) return id;
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException(`Invalid ${field}: ${id}`);
    return new Types.ObjectId(id);
  }

  /** Ensure a user document exists with all TabBarId enums */
  async ensureUserDoc(userId: string | Types.ObjectId) {
    const _user = this.ensureId(userId, 'user');
    return this.model.findOneAndUpdate(
      { user: _user },
      { $setOnInsert: { user: _user } },
      { upsert: true, new: true }
    ).lean().exec();
  }

  /** Get all flags for a user */
  async getByUser(userId: string | Types.ObjectId) {
    const _user = this.ensureId(userId, 'user');
    const doc = await this.model.findOne({ user: _user }).lean().exec();
    return doc ?? this.ensureUserDoc(_user);
  }

  /** Toggle badge for a single tab */
  async setBadge(userId: string | Types.ObjectId, tabId: TabBarId, badge: boolean) {
    const _user = this.ensureId(userId, 'user');
    await this.ensureUserDoc(_user);

    return this.model.findOneAndUpdate(
      { user: _user },
      { $set: { 'tabs.$[el].badge': !!badge } },
      { new: true, lean: true, arrayFilters: [{ 'el.id': tabId }] }
    ).exec();
  }

  /** Reset all badges to false */
  async clearAllBadges(userId: string | Types.ObjectId) {
    const _user = this.ensureId(userId, 'user');
    await this.ensureUserDoc(_user);

    return this.model.findOneAndUpdate(
      { user: _user },
      { $set: { 'tabs.$[].badge': false } },
      { new: true, lean: true }
    ).exec();
  }

  /** Bulk set badges (only for given TabIds) */
  async setManyBadges(userId: string | Types.ObjectId, on: TabBarId[] = []) {
    const _user = this.ensureId(userId, 'user');
    await this.ensureUserDoc(_user);

    // clear all first
    await this.model.updateOne({ user: _user }, { $set: { 'tabs.$[].badge': false } }).exec();

    if (on.length) {
      await this.model.updateOne(
        { user: _user },
        { $set: { 'tabs.$[el].badge': true } },
        { arrayFilters: [{ 'el.id': { $in: on } }] }
      ).exec();
    }

    return this.getByUser(_user);
  }
}
