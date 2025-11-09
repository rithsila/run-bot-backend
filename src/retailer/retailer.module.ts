import { Module } from '@nestjs/common';
import { RetailerService } from './retailer.service';
import { RetailerController } from './retailer.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Retailer, RetailerSchema } from './retailer.schema';
import { QueueModule } from 'src/queue/queue.module';
import { WebPushSubModule } from 'src/web-push-sub/web-push-sub.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Retailer.name, schema: RetailerSchema }]),
    WebPushSubModule,
    QueueModule
  ],
  providers: [RetailerService],
  controllers: [RetailerController]
})
export class RetailerModule { }
