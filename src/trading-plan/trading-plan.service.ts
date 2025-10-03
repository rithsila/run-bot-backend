// src/trading-plans/trading-plan.service.ts
import {
  BadRequestException,
  ForbiddenException,
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

const MAX_PLANS_PER_USER = 6;

@Injectable()
export class TradingPlanService {
  constructor(
    @InjectModel(TradingPlan.name)
    private readonly planModel: Model<TradingPlanDocument>,
  ) { }
  async create(currentUserId: string, dto: CreateTradingPlanDto) {
    const userId = this.asObjectId(currentUserId);

    // OPTIONAL: ensure you have this compound index for speed
    // TradingPlanSchema.index({ publishedBy: 1, createdAt: 1 });

    const session = await this.planModel.db.startSession();
    try {
      let created;
      await session.withTransaction(async () => {
        // Count current docs for this user
        const count = await this.planModel.countDocuments({ publishedBy: userId }).session(session);

        // If at or above the cap, delete the oldest to make room
        const toDelete = Math.max(0, count - MAX_PLANS_PER_USER + 1);
        if (toDelete > 0) {
          const oldest = await this.planModel
            .find({ publishedBy: userId })
            .sort({ createdAt: 1 }) // oldest first
            .limit(toDelete)
            .select({ _id: 1 })
            .lean()
            .session(session);

          const ids = oldest.map((d) => d._id);
          if (ids.length) {
            await this.planModel.deleteMany({ _id: { $in: ids } }).session(session);
          }
        }

        // Create the new plan
        const doc = await this.planModel.create([{ ...dto, publishedBy: userId }], { session });
        created = doc[0].toObject();
      });

      return created;
    } catch (err) {
      // Fallback for non-replica-set environments (no transactions)
      if (String(err?.message || "").includes("Transaction numbers are only allowed on a replica set")) {
        // Manual, non-transactional fallback (best-effort)
        const count = await this.planModel.countDocuments({ publishedBy: userId });
        const toDelete = Math.max(0, count - MAX_PLANS_PER_USER + 1);
        if (toDelete > 0) {
          const oldest = await this.planModel
            .find({ publishedBy: userId })
            .sort({ createdAt: 1 })
            .limit(toDelete)
            .select({ _id: 1 })
            .lean();

          const ids = oldest.map((d) => d._id);
          if (ids.length) {
            await this.planModel.deleteMany({ _id: { $in: ids } });
          }
        }
        const doc = await this.planModel.create({ ...dto, publishedBy: userId });
        return doc.toObject();
      }

      throw err;
    } finally {
      session.endSession();
    }
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

  // --- helpers ---
  private asObjectId(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid user id');
    }
    return new Types.ObjectId(id);
  }

  private ensureOwner(ownerId: Types.ObjectId | string, userId: Types.ObjectId) {
    const own =
      ownerId instanceof Types.ObjectId
        ? ownerId.equals(userId)
        : String(ownerId) === String(userId);
    if (!own) throw new ForbiddenException('Not your trading plan');
  }
}
