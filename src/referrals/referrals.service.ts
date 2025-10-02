// src/referrals/referrals.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, FilterQuery } from 'mongoose';
import { Referral, ReferralDocument } from './referrals.schema';
import { UserService } from 'src/user/user.service';
import { Broker, BrokerDocument } from './broker.schema';

type CreateOrUpdateBody = {
  broker?: string;         // ObjectId as string
  user?: string;           // ObjectId as string
  partnerCode?: string;
  registerUrl?: string;
};

@Injectable()
export class ReferralsService {
  constructor(
    @InjectModel(Referral.name) private readonly model: Model<ReferralDocument>,
    @InjectModel(Broker.name) private readonly brokerModel: Model<BrokerDocument>,
    private readonly users: UserService
  ) { }

  private ensureId(id?: string, field = 'id') {
    if (!id || !isValidObjectId(id)) throw new BadRequestException(`${field} is invalid`);
  }

  async create(body: CreateOrUpdateBody) {
    this.ensureId(body?.broker, 'broker');
    this.ensureId(body?.user, 'user');

    const user = await this.users.findById(body!.user!);
    if (!user) throw new NotFoundException('User not found');
    
    const broker = await this.brokerModel.findById(body!.broker!).lean();
    if (!broker) throw new NotFoundException('Broker not found');
    try {
      const created = await this.model.create({
        broker: body!.broker,
        user: body!.user,
        partnerCode: body?.partnerCode?.trim(),
        registerUrl: body?.registerUrl?.trim(),
      });

      // Return populated doc (partnerCode is select:false by default; select it explicitly if you want it)
      return this.model
        .findById(created._id)
        .select('+partnerCode')
        .populate('broker', 'name logo')
        .populate('user', 'firstName lastName email')
        .lean();
    } catch (e: any) {
      if (e?.code === 11000) {
        throw new BadRequestException('Referral already exists for this broker and user');
      }
      throw e;
    }
  }

  async findAll(query: {
    page?: number;
    limit?: number;
    broker?: string;
    user?: string;
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));

    const filter: FilterQuery<ReferralDocument> = {};
    if (query.broker) {
      this.ensureId(query.broker, 'broker');
      filter.broker = query.broker;
    }
    if (query.user) {
      this.ensureId(query.user, 'user');
      filter.user = query.user;
    }

    const q = this.model
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('broker', 'name logo')
      .populate('user', 'firstName lastName email');

    const [data, total] = await Promise.all([q.lean(), this.model.countDocuments(filter)]);
    return { data, page, limit, total, pages: Math.ceil(total / limit) };
  }

  async findOne(id: string, includePartnerCode = false) {
    this.ensureId(id);
    const q = this.model
      .findById(id)
      .populate('broker', 'name logo')
      .populate('user', 'firstName lastName email');
    if (includePartnerCode) q.select('+partnerCode');

    const doc = await q.lean();
    if (!doc) throw new NotFoundException('Referral not found');
    return doc;
  }

  async update(id: string, body: CreateOrUpdateBody) {
    this.ensureId(id);

    const update: Partial<Referral> = {};
    if (body.broker) {
      this.ensureId(body.broker, 'broker');
      (update as any).broker = body.broker;
    }
    if (body.user) {
      this.ensureId(body.user, 'user');
      (update as any).user = body.user;
    }
    if (typeof body.partnerCode === 'string') update.partnerCode = body.partnerCode.trim();
    if (typeof body.registerUrl === 'string') update.registerUrl = body.registerUrl.trim();

    try {
      const q = this.model
        .findByIdAndUpdate(id, update, { new: true, runValidators: true })
        .populate('broker', 'name logo')
        .populate('user', 'firstName lastName email');

      // expose partnerCode only if explicitly updated or exists in DB — opt-in here:
      q.select('+partnerCode');

      const doc = await q.lean();
      if (!doc) throw new NotFoundException('Referral not found');
      return doc;
    } catch (e: any) {
      if (e?.code === 11000) {
        throw new BadRequestException('Referral already exists for this broker and user');
      }
      throw e;
    }
  }

  async remove(id: string) {
    this.ensureId(id);
    const doc = await this.model.findByIdAndDelete(id).lean();
    if (!doc) throw new NotFoundException('Referral not found');
    return { deleted: true };
  }
}
