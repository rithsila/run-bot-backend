// src/marketplace/order.service.ts
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, PaginateOptions, PaginateResult, Types } from 'mongoose';
import { UserCreateOrderDto } from './dto/user-create-order.dto';
import * as orderSchema from './order.schema';
import { Product, ProductDocument, ProductStatus } from 'src/marketplace/product.schema';
import { Coupon, CouponDocument, CouponStatus } from 'src/coupons/coupon.schema';
import { Subscription, SubscriptionDocument, SubscriptionStatus } from 'src/subscriptions/subscriptions.schema';
import { PaginateOrdersDto } from './dto/paginate-orders.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { User, UserDocument } from 'src/user/user.schema';

@Injectable()
export class OrderService {
  constructor(
    @InjectModel(orderSchema.Order.name)
    private readonly orderModel: orderSchema.OrderPaginateModel,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(Coupon.name)
    private readonly couponModel: Model<CouponDocument>,
    @InjectModel(Subscription.name)
    private readonly subscriptionModel: Model<SubscriptionDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) { }

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
    const activeStatuses = [orderSchema.OrderStatus.INIT, orderSchema.OrderStatus.UNPAID] as const;

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
    const nextBill = this.calculateNextBillDate(billingPeriod);

    try {
      const doc = await this.orderModel.create({
        user: userObjectId,
        product: productObjectId,
        status: orderSchema.OrderStatus.INIT,
        idempotencyKey: idempotencyKey ?? this.generateOrderId(),
        orderId,
        amount,
        billingPeriod,
        couponCode: couponCodeToSave,
        discount: couponPercent,
        affiliate: affiliateUserId,
        tvUsernameAck: dto.tvUsernameAck?.trim() || undefined,
        bankAccountName: dto.bankAccountName,
        orderedAt: new Date(),
      });

      await this.subscriptionModel.create({
        user: userObjectId,
        product: productObjectId,
        status: SubscriptionStatus.Pending,
        nextBill,
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

  async paginate(dto: PaginateOrdersDto): Promise<PaginateResult<orderSchema.OrderDocument>> {
    const { q, status, page = 1, limit = 20 } = dto;
    const filter: FilterQuery<orderSchema.OrderDocument> = {};

    if (status) {
      filter.status = status;
    }

    if (q && q.trim()) {
      const trimmed = q.trim();
      const rx = new RegExp(this.escapeRegex(trimmed), 'i');
      const users = await this.userModel
        .find(
          {
            $or: [
              { firstName: rx },
              { lastName: rx },
              {
                $expr: {
                  $regexMatch: {
                    input: {
                      $trim: {
                        input: {
                          $concat: ['$firstName', ' ', { $ifNull: ['$lastName', ''] }],
                        },
                      },
                    },
                    regex: this.escapeRegex(trimmed),
                    options: 'i',
                  },
                },
              },
            ],
          },
          { _id: 1 },
        )
        .limit(500)
        .lean()
        .exec();

      const userIds = users.map((u) => u._id);
      filter.user = { $in: userIds.length ? userIds : [] };
    }

    const options: PaginateOptions = {
      page,
      limit,
      sort: { orderedAt: -1 },
      lean: true,
      leanWithId: false,
      populate: [
        { path: 'user', select: '_id firstName lastName email' },
        { path: 'product', select: 'name pricing billingPeriod' },
      ],
    };

    return this.orderModel.paginate(filter, options);
  }

  async getUserOrders(
    userId: string | Types.ObjectId,
    opts: { productId?: string | Types.ObjectId; onlyActive?: boolean } = {},
  ) {
    const userObjectId = new Types.ObjectId(userId);
    const filter: any = { user: userObjectId };
    if (opts.productId) {
      filter.product = new Types.ObjectId(opts.productId);
    }
    if (opts.onlyActive) {
      filter.status = { $in: [orderSchema.OrderStatus.INIT, orderSchema.OrderStatus.UNPAID] };
    }
    return this.orderModel.find(filter).sort({ orderedAt: -1 }).lean();
  }

  async getOrderById(orderId: string) {
    if (!Types.ObjectId.isValid(orderId)) {
      throw new NotFoundException('Order not found');
    }

    const order = await this.orderModel
      .findById(orderId)
      .populate('user', '_id firstName lastName email')
      .populate('product', 'name pricing billingPeriod')
      .lean()
      .exec();

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async updateOrderStatus(orderId: string, dto: UpdateOrderStatusDto) {
    if (!Types.ObjectId.isValid(orderId)) {
      throw new NotFoundException('Order not found');
    }

    const updated = await this.orderModel
      .findByIdAndUpdate(
        orderId,
        { status: dto.status },
        { new: true, runValidators: true },
      )
      .populate('user', '_id firstName lastName email')
      .populate('product', 'name pricing billingPeriod')
      .lean()
      .exec();

    if (!updated) {
      throw new NotFoundException('Order not found');
    }

    const userId = new Types.ObjectId(((updated as any).user?._id ?? (updated as any).user) as string);
    const productId = new Types.ObjectId(((updated as any).product?._id ?? (updated as any).product) as string);

    let targetStatus: SubscriptionStatus;
    if (dto.status === orderSchema.OrderStatus.PAID) {
      targetStatus = SubscriptionStatus.Active;
    } else if (
      dto.status === orderSchema.OrderStatus.INIT ||
      dto.status === orderSchema.OrderStatus.UNPAID
    ) {
      targetStatus = SubscriptionStatus.Pending;
    } else {
      targetStatus = SubscriptionStatus.Paused;
    }

    await this.subscriptionModel
      .findOneAndUpdate(
        { user: userId, product: productId },
        { status: targetStatus },
        { new: true },
      )
      .lean()
      .exec();

    return updated;
  }

  private generateOrderId(): string {
    const ts = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `ORD-${ts}-${rand}`;
  }

  private calculateNextBillDate(billingPeriod: number): Date {
    const monthsToAdd = Math.max(1, Math.floor(billingPeriod));
    const next = new Date();
    next.setMonth(next.getMonth() + monthsToAdd);
    return next;
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
