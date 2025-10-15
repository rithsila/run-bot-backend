// src/retailer/retailer.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';

import { RetailerController } from './retailer.controller';
import { RetailerService } from './retailer.service';
import { RetailLatest, RetailLatestSchema } from './retailer.schema';

// If you have a RedisModule that exports RedisService, prefer importing that:
// import { RedisModule } from 'src/redis/redis.module';
import { RedisService } from 'src/redis/redis.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RetailLatest.name, schema: RetailLatestSchema },
    ]),
    // starts the Nest scheduler (needed for @Cron)
    ScheduleModule.forRoot(),
    // HTTP client for calling your FastAPI scraper
    HttpModule.register({
      timeout: 15_000,
      maxRedirects: 2,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
        Accept: 'application/json,text/*,*/*;q=0.9',
      },
    }),
    // If you have a RedisModule, use it instead of providing RedisService directly:
    // RedisModule,
  ],
  controllers: [RetailerController],
  providers: [
    RetailerService,
    // Remove this if you import a RedisModule that already provides it
    RedisService,
  ],
  exports: [RetailerService],
})
export class RetailerModule {}
