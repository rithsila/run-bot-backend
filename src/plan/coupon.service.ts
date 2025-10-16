// src/coupons/coupon.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, isValidObjectId, Model } from 'mongoose';
import { Coupon, CouponDocument } from './coupon.schema';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { CouponStatus } from './plan.enum';

@Injectable()
export class CouponService {
  constructor(
    @InjectModel(Coupon.name)
    private readonly couponModel: Model<CouponDocument>,
  ) { }

  private ensureId(id: string) {
    if (!id || !isValidObjectId(id)) {
      throw new BadRequestException('Invalid coupon id');
    }
  }

  async create(dto: CreateCouponDto): Promise<Coupon> {
    const code = dto.code?.trim().toUpperCase();
    if (!code) {
      throw new BadRequestException('Coupon code is required');
    }

    // prevent duplicate code
    const exists = await this.couponModel.exists({ code } as FilterQuery<CouponDocument>);
    if (exists) {
      throw new BadRequestException('Coupon code already exists');
    }

    if (dto.discount == null || dto.discount < 0) {
      throw new BadRequestException('Discount must be >= 0');
    }

    const doc = new this.couponModel({
      ...dto,
      owner: dto.owner?.trim(),
      code, // normalized
      status: dto.status ?? CouponStatus.Active,
      discount: dto.discount,
    });

    return await doc.save();
  }

  async findAll() {
    const items = await this.couponModel
      .find()
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return items;
  }

  async findOne(id: string): Promise<Coupon> {
    this.ensureId(id);
    const doc = await this.couponModel.findById(id).lean<Coupon>().exec();
    if (!doc) throw new NotFoundException('Coupon not found');
    return doc;
  }

  async findByCode(rawCode: string): Promise<Coupon> {
    const code = rawCode?.trim().toUpperCase();
    if (!code) throw new BadRequestException('Invalid coupon code');

    const doc = await this.couponModel
      .findOne({ code })
      .lean<Coupon>()
      .exec();

    if (!doc) throw new NotFoundException('Coupon not found');
    return doc;
  }

  async update(id: string, dto: CreateCouponDto): Promise<Coupon> {
    this.ensureId(id);

    // If code is being changed, ensure uniqueness
    if (dto.code) {
      const nextCode = dto.code.trim().toUpperCase();
      const dupe = await this.couponModel.exists({
        _id: { $ne: id },
        code: nextCode,
      } as FilterQuery<CouponDocument>);
      if (dupe) {
        throw new BadRequestException('Another coupon with this code already exists');
      }
    }

    if (dto.discount != null && dto.discount < 0) {
      throw new BadRequestException('Discount must be >= 0');
    }

    const updateDoc: Partial<Coupon> = {
      ...dto,
      ...(dto.owner !== undefined ? { owner: dto.owner?.trim() } : {}),
      ...(dto.code !== undefined ? { code: dto.code?.trim().toUpperCase() } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.discount !== undefined ? { discount: dto.discount } : {}),
    };

    const doc = await this.couponModel
      .findByIdAndUpdate(id, updateDoc, { new: true, runValidators: true })
      .lean<Coupon>()
      .exec();

    if (!doc) throw new NotFoundException('Coupon not found');
    return doc;
  }

  async remove(id: string): Promise<{ deleted: boolean }> {
    this.ensureId(id);
    const res = await this.couponModel.findByIdAndDelete(id).exec();
    if (!res) throw new NotFoundException('Coupon not found');
    return { deleted: true };
  }
}
