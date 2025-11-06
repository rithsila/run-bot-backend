// src/trading-plans/trading-plan.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  TradingPlan,
  TradingPlanDocument,
} from './trading-plan.schema';
import { CreateTradingPlanDto } from './dto/create-trading-plan.dto';
import { WebPushSubService } from 'src/web-push-sub/web-push-sub.service';
import { TradingPlanLean } from 'src/common/types/trading.type';
import { RealtimeGateway } from 'src/real-time/realtime.gateway';
import { PushProducer } from 'src/queue/push.producer';


const MAX_PLANS_PER_USER = 6;

@Injectable()
export class TradingPlanService {

  constructor(
    @InjectModel(TradingPlan.name)
    private readonly planModel: Model<TradingPlanDocument>,
    private readonly realtime: RealtimeGateway,
    private readonly pushProducer: PushProducer,              // +++
    private readonly webPushSubService: WebPushSubService
  ) { }

  async create(currentUserId: string, dto: CreateTradingPlanDto) {
    const userId = this.asObjectId(currentUserId);
    let created!: TradingPlanLean;

    const session = await this.planModel.db.startSession();
    try {
      await session.withTransaction(async () => {
        const count = await this.planModel
          .countDocuments({ publishedBy: userId })
          .session(session);

        const toDelete = Math.max(0, count - MAX_PLANS_PER_USER + 1);
        if (toDelete > 0) {
          const oldest = await this.planModel
            .find({ publishedBy: userId })
            .sort({ createdAt: 1 })
            .limit(toDelete)
            .select({ _id: 1 })
            .lean()
            .session(session);

          const ids = oldest.map(d => d._id);
          if (ids.length) {
            await this.planModel.deleteMany({ _id: { $in: ids } }).session(session);
          }
        }

        const [doc] = await this.planModel.create([{ ...dto, publishedBy: userId }], { session });

        created = await this.planModel
          .findById(doc._id)
          .lean<TradingPlanLean>()
          .session(session)
          .orFail();
      });
    } catch (err: any) {
      if (String(err?.message || '').includes('Transaction numbers are only allowed on a replica set')) {
        const count = await this.planModel.countDocuments({ publishedBy: userId });
        const toDelete = Math.max(0, count - MAX_PLANS_PER_USER + 1);
        if (toDelete > 0) {
          const oldest = await this.planModel
            .find({ publishedBy: userId })
            .sort({ createdAt: 1 })
            .limit(toDelete)
            .select({ _id: 1 })
            .lean();

          const ids = oldest.map(d => d._id);
          if (ids.length) {
            await this.planModel.deleteMany({ _id: { $in: ids } });
          }
        }

        const doc = await this.planModel.create({ ...dto, publishedBy: userId });
        created = await this.planModel.findById(doc._id).lean<TradingPlanLean>().orFail();
      } else {
        throw err;
      }
    } finally {
      session.endSession();
    }

    // ---- Push notification (tiny payload; SW will fetch full content by id) ----
    try {
      const tinyPayload = {
        title: 'New Trading Plan 📈',
        body: `${created.pair} • ${created.direction}`
      };

      // Exclude author if provided on dto (optional)
      let excludeId: Types.ObjectId | null = null;
      const maybeAuthorId = (dto as any)?.authorId;
      if (maybeAuthorId) {

        try { excludeId = new Types.ObjectId(String(maybeAuthorId)); } catch { /* ignore bad id */ }
      }

      // Get recipients (all active users, optionally excluding author).
      const recipients = await this.webPushSubService.getUserIdsExcept(
        excludeId ?? new Types.ObjectId('000000000000000000000000') // excludes no one if author unknown
      );

      if (recipients.length) {
        await this.pushProducer.enqueueSendToUsers(
          recipients,
          tinyPayload,
          { ttl: 3600, chunkSize: 500 }
        );
      }
    } catch (e) {
      // Don’t block creation on push failures
      console.warn('[TradingPlan.create] push enqueue failed:', e);
    }
    // ---------------------------------------------------------------

    return created;
  }

  async findAll() {
    return this.planModel
      .find({})
      .sort({ createdAt: -1 })
      .lean();
  }
  async findById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid trading plan id');
    }
    const doc = await this.planModel.findById(id).lean();
    if (!doc) {
      throw new NotFoundException('Trading plan not found');
    }
    return doc;
  }
  async remove(planId: string) {
    if (!Types.ObjectId.isValid(planId)) {
      throw new BadRequestException('Invalid trading plan id');
    }

    // Atomic: match by _id + publishedBy
    const deleted = await this.planModel
      .findOneAndDelete({ _id: planId })
      .lean();

    if (!deleted) {
      // Either it didn’t exist, or it wasn’t owned by this user
      throw new NotFoundException('Trading plan not found');
    }

    return { ok: true, id: String(deleted._id) };
  }

  async update(planId: string, dto: CreateTradingPlanDto) {
    if (!Types.ObjectId.isValid(planId)) {
      throw new BadRequestException('Invalid trading plan id');
    }


    const updated = await this.planModel
      .findByIdAndUpdate(planId, {
        pair: dto?.pair,
        direction: dto?.direction,
        description: dto?.description,
        thumbnailUrl: dto?.thumbnailUrl,
        tradingViewId: dto?.tradingViewId
      }, { new: true, runValidators: true })
      .lean<TradingPlanLean>()
      .exec();

    if (!updated) {
      throw new NotFoundException('Trading plan not found');
    }

    // Optional: publish any badges/updates on edit as well
    this.realtime.publishBadge('trading-plans');

    return updated;
  }


  // --- helpers ---
  private asObjectId(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid user id');
    }
    return new Types.ObjectId(id);
  }
}
