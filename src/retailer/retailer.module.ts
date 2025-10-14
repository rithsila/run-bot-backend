// src/retailer/retailer.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { RetailerController } from './retailer.controller';
import { RetailerService } from './retailer.service';

import { ApiKeyGuard } from 'src/common/security/api-key.guard';
import { RetailLatest, RetailLatestSchema } from './retail-latest.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RetailLatest.name, schema: RetailLatestSchema },
    ]),

  ],
  controllers: [RetailerController],
  providers: [
    RetailerService,
    ApiKeyGuard,
  ],
  exports: [
    ApiKeyGuard,
    RetailerService,
  ],
})
export class RetailerModule {}
