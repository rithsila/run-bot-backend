import { Module } from '@nestjs/common';
import { LicenseRequestService } from './license-request.service';
import { LicenseRequestController } from './license-request.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { LicenseRequest, LicenseRequestSchema } from './license-request.schema';
import { WebPushSubModule } from 'src/web-push-sub/web-push-sub.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LicenseRequest.name, schema: LicenseRequestSchema },
    ]),
    WebPushSubModule
  ],
  providers: [LicenseRequestService],
  controllers: [LicenseRequestController]
})
export class LicenseRequestModule { }
