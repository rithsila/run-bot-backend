import { Module } from '@nestjs/common';
import { TabFlagsService } from './tab-flags.service';
import { TabFlagsController } from './tab-flags.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { TabBar, TabBarSchema } from './tab-flags.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: TabBar.name, schema: TabBarSchema }]),
  ],
  providers: [TabFlagsService],
  controllers: [TabFlagsController],
  exports: [TabFlagsService]
})
export class TabFlagsModule { }
