// src/referrals/referrals.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, FilterQuery } from 'mongoose';
import { Referral, ReferralDocument } from './referrals.schema';
import { UserService } from 'src/user/user.service';
import { Broker, BrokerDocument } from './broker.schema';

type CreateOrUpdateBody = {
  broker?: string;
  title: string;
  logoUrl?: string;
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


    const broker = await this.brokerModel.findById(body!.broker!).lean();
    if (!broker) throw new NotFoundException('Broker not found');
    try {
      const created = await this.model.create({
        broker: body!.broker,
        title: body?.title,
        logoUrl: body?.logoUrl,
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

    const q = this.model
      .find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('broker', 'name logo')

    const [data, total] = await Promise.all([q.lean(), this.model.countDocuments()]);
    return { data, page, limit, total, pages: Math.ceil(total / limit) };
  } 
}
