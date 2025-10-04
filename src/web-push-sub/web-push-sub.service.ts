// src/push/web-push-sub.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import pLimit from 'p-limit';
import webpush, { PushSubscription } from 'web-push';
import { WebPushSub, WebPushSubDocument } from './web-push-sub.schema';


const CONCURRENCY = 25;                  // parallel calls to push gateways
const INACTIVE_PRUNE_DAYS = 30;          // hard-delete after N days of failure

@Injectable()
export class WebPushSubService {
  private readonly log = new Logger(WebPushSubService.name);
  private readonly limit = pLimit(CONCURRENCY);

  constructor(
    @InjectModel(WebPushSub.name)
    private readonly sub: Model<WebPushSubDocument>,
  ) {
    // Initialise VAPID credentials once
    webpush.setVapidDetails(
      process.env.PUSH_VAPID_SUBJECT!,
      process.env.PUSH_VAPID_PUBLIC_KEY!,
      process.env.PUSH_VAPID_PRIVATE_KEY!,
    );
  }

  async getUserIdsExcept(
    exclude: Types.ObjectId,
  ): Promise<Types.ObjectId[]> {
    const ids = (await this.sub
      .distinct('userId', {
        active: true,
        userId: { $ne: exclude },
      })
      .exec()) as Types.ObjectId[];       // <- now the cast is safe

    return ids;
  }
  /* ────────── CRUD ────────── */

  /**
   * Insert or update a browser-subscription for a user.
   * Called from `/push/subscribe` controller.
   */
  async upsertSubscription(
    userId: Types.ObjectId,
    data: {
      endpoint: string;
      expirationTime: number | null;
      keys: { p256dh: string; auth: string };
      deviceId?: string;
      userAgent?: string | null;
      ipHint?: string | null;
    },
  ) {
    await this.sub.findOneAndUpdate(
      { userId, endpoint: data.endpoint },
      {
        $set: {
          p256dh: data.keys.p256dh,
          auth: data.keys.auth,
          expirationTime: data.expirationTime
            ? new Date(data.expirationTime)
            : null,
          deviceId: data.deviceId ?? null,
          userAgent: data.userAgent ?? null,
          ipHint: data.ipHint ?? null,
          active: true,
          lastFailedAt: null,
        },
      },
      { new: true, upsert: true },
    );
  }

  /**
   * Mark one endpoint inactive (called on user “unsubscribe” or local errors).
   */
  async deactivateEndpoint(userId: Types.ObjectId, endpoint: string) {
    await this.sub.updateOne(
      { userId, endpoint },
      { $set: { active: false, lastFailedAt: new Date() } },
    );
  }

  /* ────────── Sending helpers ────────── */

  /**
   * Fan-out to every active subscription belonging to the given user IDs.
   */
  async sendToUsers(
    userIds: Types.ObjectId[],
    payload: unknown,
    ttl = 60,
  ) {
    const cursor = this.sub
      .find({ userId: { $in: userIds }, active: true })
      .lean()
      .cursor();

    const errors: { endpoint: string; code: number }[] = [];

    for await (const s of cursor) {
      this.limit(async () => {
        try {
          await webpush.sendNotification(
            <PushSubscription>{
              endpoint: s.endpoint,
              expirationTime: null,
              keys: { p256dh: s.p256dh, auth: s.auth },
            },
            JSON.stringify(payload),
            { TTL: ttl },
          );
        } catch (e: any) {
          // 404 / 410 → endpoint is gone
          const gone = e.statusCode === 404 || e.statusCode === 410;
          if (gone) {
            await this.sub.updateOne(
              { _id: s._id },
              { $set: { active: false, lastFailedAt: new Date() } },
            );
            this.log.debug(`Deactivated gone endpoint ${s.endpoint}`);
          } else {
            errors.push({ endpoint: s.endpoint, code: e.statusCode ?? 0 });
          }
        }
      });
    }
    await this.limit.clearQueue();
    return { ok: true, failed: errors.length, errors };
  }

  /**
   * Broadcast to **all** active subscriptions in the collection.
   * Wrap this in an admin-only controller endpoint.
   */
  async broadcast(payload: unknown, ttl = 60) {
    const userIds = await this.sub.distinct('userId', { active: true });
    return this.sendToUsers(userIds as Types.ObjectId[], payload, ttl);
  }


  /* ────────── Nightly cleanup ────────── */

  /**
   * Hard-delete inactive subscriptions once they’ve been dead for N days.
   * Runs daily at 02:17 AM. Adjust the cron expression or period as needed.
   */
  @Cron('17 2 * * *')
  async pruneOldInactive() {
    const cutoff = new Date(
      Date.now() - INACTIVE_PRUNE_DAYS * 24 * 60 * 60 * 1000,
    );
    const res = await this.sub.deleteMany({
      active: false,
      lastFailedAt: { $lt: cutoff },
    });
    if (res.deletedCount) {
      this.log.log(
        `Pruned ${res.deletedCount} inactive Web-Push subscriptions.`,
      );
    }
  }


}
