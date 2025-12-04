// src/marketplace/order.service.ts
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, PaginateOptions, PaginateResult, Types } from 'mongoose';
import { UserCreateOrderDto } from './dto/user-create-order.dto';
import * as orderSchema from './order.schema';
import { Subscription, SubscriptionDocument, SubscriptionStatus } from 'src/subscriptions/subscriptions.schema';
import { PaginateOrdersDto } from './dto/paginate-orders.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { User, UserDocument } from 'src/user/user.schema';
import { PushProducer } from 'src/queue/push.producer';
import { WebPushSubService } from 'src/web-push-sub/web-push-sub.service';
import { BillPeriod, Product, ProductDocument } from 'src/products/product.schema';

@Injectable()
export class OrderService {
  constructor(
    @InjectModel(orderSchema.Order.name)
    private readonly orderModel: orderSchema.OrderPaginateModel,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(Subscription.name)
    private readonly subscriptionModel: Model<SubscriptionDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly pushProducer: PushProducer,
    private readonly webPushSubService: WebPushSubService,
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

    // --- 3) Product ---
    const product = await this.productModel.findById(dto.product).lean();
    if (!product) throw new NotFoundException('Product not found');

    const billPeriod = dto.billPeriod;
    const billingMonths = this.mapBillPeriodToMonths(billPeriod);
    const amount = Number(dto.amount);
    if (Number.isNaN(amount) || amount < 0) {
      throw new BadRequestException('Invalid amount');
    }

    // --- 4) TradingView username: conditional requirement ---
    let tradingViewUsername: string | undefined = undefined;

    if (product.requireTradingViewUsername) {
      // for this product TradingView username IS required
      const tv = dto.tradingViewUsername?.trim();
      if (!tv) {
        throw new BadRequestException('TradingView username is required for this product');
      }
      tradingViewUsername = tv;
    } else {
      // not required; if provided, trim and store, otherwise ignore
      if (typeof dto.tradingViewUsername === 'string') {
        const tv = dto.tradingViewUsername.trim();
        tradingViewUsername = tv.length > 0 ? tv : undefined;
      }
    }

    const initialStatus = dto.status ?? orderSchema.OrderStatus.INIT;
    if (
      ![
        orderSchema.OrderStatus.INIT,
        orderSchema.OrderStatus.PAID,
        orderSchema.OrderStatus.FAILED,
      ].includes(initialStatus)
    ) {
      throw new BadRequestException('Unsupported initial status');
    }

    const shouldEnsureActive = initialStatus === orderSchema.OrderStatus.INIT;
    if (shouldEnsureActive) {
      const existingActive = await this.orderModel
        .findOne({
          user: userObjectId,
          product: productObjectId,
          status: orderSchema.OrderStatus.INIT,
        })
        .lean();
      if (existingActive) {
        throw new BadRequestException('You already have an active order for this product.');
      }
    }

    const orderId = this.generateOrderId();
    const nextBill = this.calculateNextBillDate(billingMonths);
    const expiry =
      initialStatus === orderSchema.OrderStatus.PAID
        ? this.calculateExpiry(new Date(), billingMonths)
        : null;
    const subscriptionStatus =
      initialStatus === orderSchema.OrderStatus.PAID
        ? SubscriptionStatus.Active
        : initialStatus === orderSchema.OrderStatus.FAILED
        ? SubscriptionStatus.Paused
        : SubscriptionStatus.Pending;

    try {
      const doc = await this.orderModel.create({
        user: userObjectId,
        product: productObjectId,
        status: initialStatus,
        idempotencyKey: idempotencyKey ?? this.generateOrderId(),
        orderId,
        amount,
        billPeriod,
        tradingViewUsername, // <- use the variable we computed above
        bankAccountName: dto.bankAccountName,
        orderedAt: new Date(),
        expiredAt: expiry,
      });

      if (shouldEnsureActive) {
        await this.subscriptionModel.create({
          user: userObjectId,
          product: productObjectId,
          status: subscriptionStatus,
          billPeriod,
          nextBill,
        });
      }

      const orderObject = (doc as any).toObject ? (doc as any).toObject() : doc;

      try {
        const recipients = await this.webPushSubService.getAdminIds();
        if (recipients.length) {
          const tinyPayload = {
            title: 'New order request',
            body: `Order ${orderId} placed by user ${userId}`,
          };
          await this.pushProducer.enqueueSendToUsers(recipients, tinyPayload, {
            ttl: 3600,
            chunkSize: 500,
          });
        }
      } catch (e) {
        console.warn(
          '[OrderService.createUserRequestOrder] push enqueue failed:',
          e,
        );
      }

      return orderObject;
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
        { path: 'product', select: 'name billPeriod' },
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
      .populate('product', 'name billPeriod')
      .lean()
      .exec();

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async getOrderByUserAndProduct(userId: string | Types.ObjectId, productId: string | Types.ObjectId) {
    if (!Types.ObjectId.isValid(String(userId)) || !Types.ObjectId.isValid(String(productId))) {
      throw new NotFoundException('Order not found');
    }

    const order = await this.orderModel
      .find({
        user: new Types.ObjectId(userId),
        product: new Types.ObjectId(productId),
      })
      .lean()
      .exec();

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async getOrderBySubscription(subscriptionId: string) {
    if (!Types.ObjectId.isValid(subscriptionId)) {
      throw new NotFoundException('Subscription not found');
    }

    const subscription = await this.subscriptionModel
      .findById(subscriptionId)
      .lean()
      .exec();

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    return this.getOrderByUserAndProduct(subscription.user, subscription.product);
  }

  async updateOrderStatus(orderId: string, dto: UpdateOrderStatusDto, updatedBy?: string) {
    if (!Types.ObjectId.isValid(orderId)) {
      throw new NotFoundException('Order not found');
    }

    const existing = await this.orderModel.findById(orderId).lean();
    if (!existing) {
      throw new NotFoundException('Order not found');
    }

    const billMonths = this.mapBillPeriodToMonths(existing.billPeriod as BillPeriod);
    const expiry =
      dto.status === orderSchema.OrderStatus.PAID
        ? this.calculateExpiry(existing.orderedAt ?? new Date(), billMonths)
        : null;

    const updatePayload: any = { status: dto.status, expiredAt: expiry };
    if (updatedBy && Types.ObjectId.isValid(updatedBy)) {
      updatePayload.updatedBy = new Types.ObjectId(updatedBy);
    }

    const updated = await this.orderModel
      .findByIdAndUpdate(
        orderId,
        updatePayload,
        { new: true, runValidators: true },
      )
      .populate('user', '_id firstName lastName email')
      .populate('product', 'name billPeriod')
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

    const subUpdate: Partial<SubscriptionDocument> = { status: targetStatus };
    if (targetStatus === SubscriptionStatus.Active) {
      const nextBill = this.calculateNextBillDate(billMonths);
      (subUpdate as any).nextBill = nextBill;
    }

    await this.subscriptionModel
      .findOneAndUpdate(
        { user: userId, product: productId },
        subUpdate,
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
    if (billingPeriod <= 0) {
      return new Date('9999-12-31T00:00:00.000Z');
    }
    const next = new Date();
    next.setMonth(next.getMonth() + billingPeriod);
    return next;
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private calculateExpiry(startDate: Date, billingPeriod: number): Date {
    if (billingPeriod <= 0) {
      return new Date('9999-12-31T00:00:00.000Z');
    }
    const start = new Date(startDate);
    start.setMonth(start.getMonth() + billingPeriod);
    return start;
  }

  private mapBillPeriodToMonths(period: BillPeriod): number {
    switch (period) {
      case BillPeriod.MONTH:
        return 1;
      case BillPeriod.THREE_MONTHS:
        return 3;
      case BillPeriod.SIX_MONTHS:
        return 6;
      case BillPeriod.YEAR:
        return 12;
      case BillPeriod.LIFETIME:
      case BillPeriod.ONE_TIME:
      default:
        return 0;
    }
  }
}
