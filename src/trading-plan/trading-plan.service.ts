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

    // --- enqueue push (tiny payload; SW fetches full plan by id) ---
    try {
      // Build a compact preview (adjust fields to your DTO)
      const title = `New Trading Plan${dto?.pair ? `: ${dto.pair}` : ''}`;
      const desc = [
        dto?.direction ? `Direction: ${dto.direction}` : null,
        (dto as any)?.entryPrice ? `Entry: ${(dto as any).entryPrice}` : null,
        (dto as any)?.tp ? `TP: ${(dto as any).tp}` : null,
        (dto as any)?.sl ? `SL: ${(dto as any).sl}` : null,
      ].filter(Boolean).join(' • ');

      const tinyPayload = {
        type: 'plan',
        id: String(created._id),
        preview: {
          title,
          body: desc || 'Tap to view the plan details',
        },
      };

      // All active users except the author
      const recipients = await this.webPushSubService.getUserIdsExcept(userId);

      if (recipients.length) {
        await this.pushProducer.enqueueSendToUsers(
          recipients,
          tinyPayload,
          { ttl: 1800, chunkSize: 500 } // 30m retention; tune as needed
        );
      }
    } catch (e) {
      // don’t block creation on push issues
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
