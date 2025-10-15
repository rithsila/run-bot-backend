// src/retailer/retailer.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { RetailerController } from './retailer.controller';
import { RetailerService } from './retailer.service';
import { RetailLatest, RetailLatestSchema } from './retailer.schema';
import { WebPushSubModule } from 'src/web-push-sub/web-push-sub.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RetailLatest.name, schema: RetailLatestSchema },
    ]),

    ScheduleModule.forRoot(),
    HttpModule.register({
      timeout: 15_000,
      maxRedirects: 2,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
        Accept: 'application/json,text/*,*/*;q=0.9',
      },
    }),
    WebPushSubModule
  ],
  controllers: [RetailerController],
  providers: [
    RetailerService,
  ],
  exports: [RetailerService],
})
export class RetailerModule { }
