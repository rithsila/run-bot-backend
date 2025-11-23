// src/order/dto/update-order-status.dto.ts
import { IsEnum } from 'class-validator';
import { OrderStatus } from '../order.schema';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;
}
