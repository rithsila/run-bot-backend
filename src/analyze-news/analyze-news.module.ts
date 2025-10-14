import { Module } from '@nestjs/common';
import { AnalyzeNewsService } from './analyze-news.service';
import { AnalyzeNewsController } from './analyze-news.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalyzeNews, AnalyzeNewsSchema } from './analyze-news.schema';
import { WebPushSubModule } from 'src/web-push-sub/web-push-sub.module';
import { PersistImageService } from 'src/common/persist-image.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: AnalyzeNews.name, schema: AnalyzeNewsSchema }]),
    WebPushSubModule
  ],
  providers: [AnalyzeNewsService,PersistImageService],
  controllers: [AnalyzeNewsController]
})
export class AnalyzeNewsModule { }
