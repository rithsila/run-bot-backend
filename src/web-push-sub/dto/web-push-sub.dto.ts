import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/* nested object for keys */
class PushKeysDto {
  @IsString() @IsNotEmpty()
  p256dh!: string;

  @IsString() @IsNotEmpty()
  auth!: string;
}

/* POST  /web-push-sub/subscribe */
export class SubscribeWebPushDto {
  @IsString() @IsNotEmpty()
  endpoint!: string;

  /** can be null in browsers */
  @IsOptional()
  @IsNumber()
  expirationTime!: number | null;

  @ValidateNested()
  @Type(() => PushKeysDto)
  keys!: PushKeysDto;

  @IsOptional()
  @IsString()
  deviceId?: string;
}

/* DELETE /web-push-sub/unsubscribe */
export class UnsubscribeWebPushDto {
  @IsString() @IsNotEmpty()
  endpoint!: string;
}
