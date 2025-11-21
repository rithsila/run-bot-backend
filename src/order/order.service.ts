// src/marketplace/order.service.ts
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { UserCreateOrderDto } from './dto/user-create-order.dto';
import { Order, OrderDocument, OrderStatus } from './order.schema';
import { Product, ProductDocument, ProductStatus } from 'src/marketplace/product.schema';
import { Coupon, CouponDocument, CouponStatus } from 'src/coupons/coupon.schema';

@Injectable()
export class OrderService {
  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(Coupon.name)
    private readonly couponModel: Model<CouponDocument>,
  ) {}

  async createUserRequestOrder(
    userId: string | Types.ObjectId,
    dto: UserCreateOrderDto,
    idempotencyKey?: string | null,
  ) {
    const userObjectId = new Types.ObjectId(userId);
    const productObjectId = new Types.ObjectId(dto.product);

    // --- 1) Idempotency (same as before) ---
    if (idempotencyKey) {
      const existingByIdem = await this.orderModel
        .findOne({ user: userObjectId, idempotencyKey })
        .lean();
      if (existingByIdem) return existingByIdem;
    }

    // --- 2) Enforce one ACTIVE (INIT/UNPAID) order per user+product ---
    const activeStatuses = [OrderStatus.INIT, OrderStatus.UNPAID] as const;

    const existingActive = await this.orderModel
      .findOne({
        user: userObjectId,
        product: productObjectId,
        status: { $in: activeStatuses },
      })
      .lean();

    if (existingActive) {
      // You can customize this message / code
      throw new BadRequestException(
        'You already have an active order for this product.',
      );
    }

    // --- 3) Product ---
    const product = await this.productModel.findById(dto.product).lean();
    if (!product) throw new NotFoundException('Product not found');
    if (product.status !== ProductStatus.Active) {
      throw new BadRequestException('Product is not available for ordering');
    }

    // --- 4) Coupon (optional) ---
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

      couponPercent = Math.max(0, Math.min(100, Number(coupon.percent) || 0));
      couponCodeToSave = coupon.code;

      if (coupon.createdBy) {
        affiliateUserId = new Types.ObjectId(coupon.createdBy);
      }
    }

    // --- 5) Amount & billingPeriod ---
    const basePrice = Number(product.pricing) || 0;
    const amount = Number((basePrice * (1 - couponPercent / 100)).toFixed(2));
    const billingPeriod = Number(product.billingPeriod) || 1;

    const orderId = this.generateOrderId();

    try {
      const doc = await this.orderModel.create({
        user: userObjectId,
        product: productObjectId,
        status: OrderStatus.INIT,
        idempotencyKey: idempotencyKey ?? this.generateOrderId(),
        orderId,

        amount,
        billingPeriod,

        couponCode: couponCodeToSave,
        discount: couponPercent,
        affiliate: affiliateUserId,

        tvUsernameAck: dto.tvUsernameAck?.trim() || undefined,
        accountSnapshotAck: dto.accountSnapshotAck?.trim() || undefined,
        accountConceptAck: dto.accountConceptAck?.trim() || undefined,
        riskManagementAck: dto.riskManagementAck?.trim() || undefined,

        orderedAt: new Date(),
      });

      return (doc as any).toObject ? (doc as any).toObject() : doc;
    } catch (err: any) {
      // Race condition protection: unique partial index violation
      if (err?.code === 11000 && err?.keyPattern?.user && err?.keyPattern?.product) {
        throw new BadRequestException(
          'You already have an active order for this product.',
        );
      }
      throw err;
    }
  }

  private generateOrderId(): string {
    const ts = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `ORD-${ts}-${rand}`;
  }
}
