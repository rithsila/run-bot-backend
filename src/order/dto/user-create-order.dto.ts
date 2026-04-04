// src/order/dto/user-create-order.dto.ts
import {
    IsEnum,
    IsMongoId,
    IsNumber,
    IsString,
    Matches,
    MaxLength,
    MinLength,
    Min,
    IsOptional,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { BillPeriod } from 'src/products/product.schema';
import { OrderStatus } from '../order.schema';

export class UserCreateOrderDto {
    @IsMongoId()
    product!: string;

    @IsEnum(BillPeriod)
    billPeriod!: BillPeriod;

    @IsNumber()
    @Min(0)
    amount!: number;

    // Bank account name (customer uppercase full name, e.g. "JOHN DOE")
    @IsString()
    @MinLength(4)
    @MaxLength(120)
    @Matches(/^[A-Z]+(?: [A-Z]+)+$/, {
        message:
            'Bank Account Name must be uppercase words separated by spaces (e.g. JOHN DOE)',
    })
    @Transform(({ value }) =>
        typeof value === 'string' ? value.trim().toUpperCase() : value,
    )
    bankAccountName!: string;

    // OPTIONAL: only validated if present
    @IsOptional()
    @IsString()
    @MinLength(2)
    @MaxLength(120)
    @Transform(({ value }) =>
        typeof value === 'string' ? value.trim() : value,
    )
    tradingViewUsername?: string;

    @IsOptional()
    @IsEnum(OrderStatus)
    status?: OrderStatus;
}
