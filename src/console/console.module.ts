import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { AuthModule } from '../auth/auth.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { WebPushSubModule } from '../web-push-sub/web-push-sub.module';

import { EaInstance, EaInstanceSchema } from './schemas/ea-instance.schema';
import { EaAuditLog, EaAuditLogSchema } from './schemas/ea-audit-log.schema';
import { ConsoleController } from './console.controller';
import { ConsoleGateway } from './console.gateway';
import { ConsoleService } from './console.service';
import { ConsoleScheduler } from './console.scheduler';
import { HealthCheckProcessor } from './health-check.processor';

const enableQueue = process.env.NODE_ENV !== 'development';

@Module({
    imports: [
        AuthModule,
        MembershipsModule,
        WebPushSubModule,
        MongooseModule.forFeature([
            { name: EaInstance.name, schema: EaInstanceSchema },
            { name: EaAuditLog.name, schema: EaAuditLogSchema },
        ]),
        ...(enableQueue
            ? [
                  BullModule.registerQueue({
                      name: 'console-health',
                      defaultJobOptions: {
                          attempts: 3,
                          backoff: { type: 'exponential', delay: 5000 },
                          removeOnComplete: 500,
                          removeOnFail: false,
                      },
                  }),
              ]
            : []),
    ],
    controllers: [ConsoleController],
    providers: [
        ConsoleGateway,
        ConsoleService,
        ConsoleScheduler,
        ...(enableQueue ? [HealthCheckProcessor] : []),
    ],
    exports: [ConsoleGateway, ConsoleService],
})
export class ConsoleModule {}
