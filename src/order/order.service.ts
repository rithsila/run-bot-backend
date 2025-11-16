// src/marketplace/order.service.ts
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, ClientSession, startSession } from 'mongoose';

import { UserCreateOrderDto } from './dto/user-create-order.dto';
import { Order, OrderDocument, OrderStatus } from './order.schema';
import { Product, ProductDocument, ProductStatus } from 'src/marketplace/product.schema';

import { Coupon, CouponDocument, CouponStatus } from 'src/coupons/coupon.schema'; // ⬅️ add

@Injectable()
export class OrderService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(Coupon.name) private readonly couponModel: Model<CouponDocument>, // ⬅️ add
  ) {}

  async createUserRequestOrder(
    userId: string | Types.ObjectId,
    dto: UserCreateOrderDto,
    idempotencyKey?: string | null,
  ) {
    const userObjectId = new Types.ObjectId(userId);

    // Idempotency
    if (idempotencyKey) {
      const existing = await this.orderModel.findOne({
        user: userObjectId,
        idempotencyKey,
      }).lean();
      if (existing) return existing;
    }

    // Product
    const product = await this.productModel.findById(dto.product).lean();
    if (!product) throw new NotFoundException('Product not found');
    if (product.status !== ProductStatus.Active) {
      throw new BadRequestException('Product is not available for ordering');
    }

    // --- Coupon (optional) ---
    let couponPercent = 0;
    let affiliateUserId: Types.ObjectId | undefined;
    let couponCodeToSave: string | undefined;

    if (dto.couponCode && dto.couponCode.trim() !== '') {
      const code = dto.couponCode.trim().toUpperCase();
      const coupon = await this.couponModel.findOne({ code }).lean();

      if (!coupon) {
        throw new BadRequestException('Invalid coupon code');
      }
      if (coupon.status !== CouponStatus.Active) {
        throw new BadRequestException('Coupon is not active');
      }
      // percent is 0.01..100 in schema; clamp just in case
      couponPercent = Math.max(0, Math.min(100, Number(coupon.percent) || 0));
      couponCodeToSave = coupon.code;
      if (coupon.createdBy) {
        affiliateUserId = new Types.ObjectId(coupon.createdBy);
      }
    }

    // --- Amount & billingPeriod (required by your current Order schema) ---
    const basePrice = Number(product.pricing) || 0;
    const amount = Number((basePrice * (1 - couponPercent / 100)).toFixed(2));
    const billingPeriod = Number(product.billingPeriod) || 1; 

    const orderId = this.generateOrderId();

    let session: ClientSession | null = null;
    try {
      session = await startSession();
      session.startTransaction();

      const doc = await this.orderModel.create(
        [{
          user: userObjectId,
          status: OrderStatus.INIT,
          idempotencyKey: idempotencyKey ?? this.generateOrderId(), // ensure present per schema
          orderId,
          product: new Types.ObjectId(dto.product),

          // required by current Order schema:
          amount,
          billingPeriod,

          // coupon/discount/affiliate
          couponCode: couponCodeToSave,
          discount: couponPercent, // percentage only
          affiliate: affiliateUserId,

          // customer-provided strings (optional)
          tvUsernameAck: dto.tvUsernameAck?.trim() || undefined,
          accountSnapshotAck: dto.accountSnapshotAck?.trim() || undefined,
          accountConceptAck: dto.accountConceptAck?.trim() || undefined,
          riskManagementAck: dto.riskManagementAck?.trim() || undefined,

          orderedAt: new Date(),
        }],
        { session }
      );

      await session.commitTransaction();
      return doc[0].toObject();
    } catch (err) {
      if (session) await session.abortTransaction();
      throw err;
    } finally {
      if (session) session.endSession();
    }
  }

  private generateOrderId(): string {
    const ts = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `ORD-${ts}-${rand}`;
  }
}
