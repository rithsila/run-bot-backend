import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { EaInstance, EaInstanceSchema } from './schemas/ea-instance.schema';
import { EaAuditLog, EaAuditLogSchema } from './schemas/ea-audit-log.schema';
import { ConsoleController } from './console.controller';
import { ConsoleGateway } from './console.gateway';
import { ConsoleService } from './console.service';
import { ConsoleScheduler } from './console.scheduler';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: EaInstance.name, schema: EaInstanceSchema },
            { name: EaAuditLog.name, schema: EaAuditLogSchema },
        ]),
    ],
    controllers: [ConsoleController],
    providers: [ConsoleGateway, ConsoleService, ConsoleScheduler],
    exports: [ConsoleGateway, ConsoleService],
})
export class ConsoleModule {}
