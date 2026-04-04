import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class ConsoleScheduler {
    private readonly logger = new Logger(ConsoleScheduler.name);

    constructor(
        @Optional()
        @InjectQueue('console-health')
        private readonly queue?: Queue,
    ) {}

    @Cron('*/30 * * * * *')
    async scheduleHeartbeatCheck() {
        if (!this.queue) return;
        await this.queue.add(
            'check-heartbeat',
            {},
            {
                removeOnComplete: 100,
                removeOnFail: false,
            },
        );
        this.logger.debug('Enqueued check-heartbeat job');
    }
}
