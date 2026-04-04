import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class CreateCouponDto {
    @IsString()
    @Length(4, 6, { message: 'Code must be 4–6 characters' })
    @Transform(({ value }) => String(value).trim().toUpperCase())
    code!: string;
}
