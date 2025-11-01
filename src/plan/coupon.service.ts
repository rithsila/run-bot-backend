import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Coupon, CouponDocument } from './coupon.schema';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { CouponStatus } from './plan.enum'; // change path if needed

const DEFAULT_DISCOUNT = 20; // percent

@Injectable()
export class CouponService {
  constructor(
    @InjectModel(Coupon.name)
    private readonly couponModel: Model<CouponDocument>,
  ) { }

  async upsertByCode(ownerId: Types.ObjectId, dto: CreateCouponDto): Promise<Coupon> {
    const code = (dto.code ?? '').trim().toUpperCase();
    if (code.length < 4 || code.length > 6) {
      throw new BadRequestException('Code must be 4–6 characters.');
    }

    try {
      const doc = await this.couponModel.findOneAndUpdate(
        { owner: ownerId },
        {
          $set: {
            discount: DEFAULT_DISCOUNT,
            status: CouponStatus.Active,
            code
          }
        },
        { new: true, upsert: true }
      );

      if (!doc) throw new BadRequestException('Failed to upsert coupon.');
      return doc;
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new BadRequestException('Coupon code already exists.');
      }
      throw err;
    }
  }

  async findByCode(code: string): Promise<Coupon | null> {
    return this.couponModel
      .findOne({
        code: code.trim().toUpperCase(),
        status: CouponStatus.Active
      })
      .populate('owner', 'firstName lastName')
      .exec();
  }

  async findByOwner(ownerId: string | Types.ObjectId): Promise<Coupon | null> {
    return this.couponModel
      .findOne({ owner: new Types.ObjectId(ownerId) })
      .populate('owner', 'firstName lastName')    // ⬅️ populate owner
      .exec();
  }

}
