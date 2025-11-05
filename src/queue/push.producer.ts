// src/queue/push.producer.ts
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, JobsOptions } from 'bullmq';
import { Types } from 'mongoose';

type ObjectIdLike = string | Types.ObjectId;

export interface FanoutJob {
    contentId: string;               // stringified ObjectId
    segment: string;                 // e.g., 'en', 'sports:nba'
    ttl?: number;                    // seconds for push retention (optional)
}

export interface SendToUsersJob {
    userIds: string[];               // stringified ObjectIds
    payload: unknown;                // already-small payload for web-push
    ttl?: number;                    // seconds for push retention (default 60)
}

@Injectable()
export class PushProducer {
    constructor(@InjectQueue('push') private readonly queue: Queue) { }

    /**
     * Enqueue a fanout job (segment/topic-based).
     * The worker should fetch subscriptions for `segment` and send tiny payloads with TTL.
     */
    async enqueueFanout(
        contentId: ObjectIdLike,
        segment: string,
        opts?: { ttl?: number; delayMs?: number; dedupe?: boolean; jobOpts?: JobsOptions },
    ) {
        const payload: FanoutJob = {
            contentId: String(contentId),
            segment,
            ttl: opts?.ttl,
        };

        const jobId = opts?.dedupe !== false ? `${payload.contentId}:${segment}` : undefined;

        await this.queue.add('fanout', payload, {
            jobId,                                 // idempotent by default
            delay: opts?.delayMs ?? 0,
            attempts: 8,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: 1000,
            removeOnFail: false,
            ...(opts?.jobOpts || {}),
        });
    }

    /**
     * Enqueue direct-sends to explicit userIds.
     * This chunks large lists to keep each job a reasonable size for Redis and workers.
     */
    async enqueueSendToUsers(
        userIds: ObjectIdLike[],
        payload: unknown,
        opts?: { ttl?: number; chunkSize?: number; delayMs?: number; jobOpts?: JobsOptions },
    ) {
        const ttl = opts?.ttl ?? 60;
        const chunkSize = Math.max(1, opts?.chunkSize ?? 1000);

        const chunks: string[][] = [];
        for (let i = 0; i < userIds.length; i += chunkSize) {
            chunks.push(userIds.slice(i, i + chunkSize).map(String));
        }

        const jobs = chunks.map((ids, idx) => ({
            name: 'sendToUsers' as const,
            data: { userIds: ids, payload, ttl } as SendToUsersJob,
            opts: {
                delay: (opts?.delayMs ?? 0) + idx * 5, // small stagger to smooth load
                attempts: 8,
                backoff: { type: 'exponential', delay: 2000 },
                removeOnComplete: 1000,
                removeOnFail: false,
                ...(opts?.jobOpts || {}),
            } as JobsOptions,
        }));

        if (jobs.length === 1) {
            await this.queue.add(jobs[0].name, jobs[0].data, jobs[0].opts);
        } else {
            await this.queue.addBulk(jobs);
        }
    }
}
