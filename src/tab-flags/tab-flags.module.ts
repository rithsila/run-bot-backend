import { Module } from '@nestjs/common';
import { TabFlagsService } from './tab-flags.service';
import { TabFlagsController } from './tab-flags.controller';

@Module({
  providers: [TabFlagsService],
  controllers: [TabFlagsController]
})
export class TabFlagsModule {}
