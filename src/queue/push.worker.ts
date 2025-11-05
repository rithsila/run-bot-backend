// src/queue/push.worker.ts
import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { WebPushSub, WebPushSubDocument } from 'src/web-push-sub/web-push-sub.schema';
import { WebPushSubService } from 'src/web-push-sub/web-push-sub.service';


type ObjectIdLike = string | Types.ObjectId;
interface FanoutJob { contentId: string; segment: string; ttl?: number }
interface SendToUsersJob { userIds: string[]; payload: unknown; ttl?: number }

const PAGE_SIZE = 1000;
const PAGE_JITTER_MS: [number, number] = [120, 360];

@Processor('push')
@Injectable()
export class PushWorker extends WorkerHost {
  private readonly log = new Logger(PushWorker.name);

  constructor(
    private readonly webPushSubSvc: WebPushSubService,
    @InjectModel(WebPushSub.name)
    private readonly subModel: Model<WebPushSubDocument>,
  ) { super(); }

  // BullMQ entrypoint — no @Process decorator in @nestjs/bullmq
  async process(job: Job<any>): Promise<any> {
    switch (job.name) {
      case 'sendToUsers':
        return this.handleSendToUsers(job as Job<SendToUsersJob>);
      case 'fanout':
        return this.handleFanout(job as Job<FanoutJob>);
      default:
        this.log.warn(`Unknown job: ${job.name}`);
        return { ok: true };
    }
  }

  private async handleSendToUsers(job: Job<SendToUsersJob>) {
    const { userIds, payload, ttl = 60 } = job.data;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      this.log.warn(`sendToUsers: empty userIds (jobId=${job.id})`);
      return { ok: true, failed: 0, errors: [] };
    }
    const ids = userIds.map((id) => new Types.ObjectId(id));
    const res = await this.webPushSubSvc.sendToUsers(ids, payload, ttl);
    if (res.failed > 0) {
      this.log.warn(`sendToUsers: ${res.failed} failures out of ${ids.length} (jobId=${job.id})`);
    } else {
      this.log.log(`sendToUsers: sent to ${ids.length} users (jobId=${job.id})`);
    }
    return res;
    }

  private async handleFanout(job: Job<FanoutJob>) {
    const { contentId, segment, ttl = 3600 } = job.data;
    const tiny = { id: contentId };

    const total = await this.subModel.countDocuments({ active: true, segments: segment });
    let sent = 0, failed = 0;
    let lastId: Types.ObjectId | null = null;

    while (true) {
      const q: any = { active: true, segments: segment };
      if (lastId) q._id = { $gt: lastId };

      const page = await this.subModel
        .find(q).sort({ _id: 1 }).limit(PAGE_SIZE)
        .select({ userId: 1 }).lean().exec();

      if (!page.length) break;
      lastId = page[page.length - 1]._id as Types.ObjectId;

      const ids = Array.from(new Set(page.map(s => String(s.userId))))
        .map(id => new Types.ObjectId(id));

      const res = await this.webPushSubSvc.sendToUsers(ids, tiny, ttl);
      sent += ids.length - res.failed;
      failed += res.failed;

      const [min, max] = PAGE_JITTER_MS;
      await new Promise(r => setTimeout(r, Math.floor(min + Math.random() * (max - min))));
    }

    if (failed > 0) {
      this.log.warn(`fanout: segment="${segment}" total=${total} sent=${sent} failed=${failed} (jobId=${job.id})`);
    } else {
      this.log.log(`fanout: segment="${segment}" total=${total} sent=${sent} (jobId=${job.id})`);
    }
    return { ok: failed === 0, failed, errors: [] };
  }
}
