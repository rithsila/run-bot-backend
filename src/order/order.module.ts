// src/order/order.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from './order.schema';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { Coupon, CouponSchema } from 'src/coupons/coupon.schema';
import {
    Subscription,
    SubscriptionSchema,
} from 'src/subscriptions/subscriptions.schema';
import { User, UserSchema } from 'src/user/user.schema';
import { WebPushSubModule } from 'src/web-push-sub/web-push-sub.module';
import { QueueModule } from 'src/queue/queue.module';
import { Product, ProductSchema } from 'src/products/product.schema';
import { ProductsModule } from 'src/products/products.module';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Order.name, schema: OrderSchema },
            { name: Coupon.name, schema: CouponSchema },
            { name: Subscription.name, schema: SubscriptionSchema },
            { name: User.name, schema: UserSchema },
            { name: Product.name, schema: ProductSchema },
        ]),
        WebPushSubModule,
        QueueModule,
        ProductsModule,
    ],
    controllers: [OrderController],
    providers: [OrderService],
    exports: [OrderService],
})
export class OrderModule {}
