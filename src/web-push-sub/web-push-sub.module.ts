import { Module } from '@nestjs/common';
import { WebPushSubService } from './web-push-sub.service';
import { WebPushSubController } from './web-push-sub.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { WebPushSub, WebPushSubSchema } from './web-push-sub.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: WebPushSub.name, schema: WebPushSubSchema }]),
  ],
  providers: [WebPushSubService],
  controllers: [WebPushSubController],
  exports: [WebPushSubService]
})
export class WebPushSubModule { }
