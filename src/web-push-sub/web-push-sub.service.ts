// src/push/web-push-sub.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import pLimit from 'p-limit';
import webpush, { PushSubscription } from 'web-push';
import { WebPushSub, WebPushSubDocument } from './web-push-sub.schema';
import { Role } from 'src/user/user.enum';
import { User, UserDocument } from 'src/user/user.schema';

const CONCURRENCY = 25;

@Injectable()
export class WebPushSubService {
  private readonly log = new Logger(WebPushSubService.name);
  private readonly limit = pLimit(CONCURRENCY);

  constructor(
    @InjectModel(WebPushSub.name)
    private readonly sub: Model<WebPushSubDocument>,
    @InjectModel(User.name) private readonly users: Model<UserDocument>,

  ) {

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
      .exec()) as Types.ObjectId[];

    return ids;
  }

  async getAdminIds(): Promise<Types.ObjectId[]> {
    const ids = (await this.users.distinct('_id', { role: Role.Admin }).exec()) as Types.ObjectId[];
    return ids;
  }

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

  async sendToUsers(
    userIds: Types.ObjectId[],
    payload: unknown,
    ttl = 60,
  ) {
    const cursor = this.sub
      .find({ userId: { $in: userIds }, active: true })
      .lean()
      .cursor();

    const tasks: Promise<{ endpoint: string; ok: boolean; code?: number }>[] = [];
    for await (const s of cursor) {
      tasks.push(
        this.limit(async () => {
          try {
            await webpush.sendNotification(
              {
                endpoint: s.endpoint,
                expirationTime: null,
                keys: { p256dh: s.p256dh, auth: s.auth },
              } as PushSubscription,
              JSON.stringify(payload),
              {
                TTL: ttl,          // ✔ TTL in seconds (offline retention)
                urgency: 'normal', // optional: 'very-low' | 'low' | 'normal' | 'high'
                // topic: 'updates', // optional: collapse by topic if your push service supports it
              } as any
            );
            return { endpoint: s.endpoint, ok: true as const };
          } catch (e: any) {
            const code = e?.statusCode ?? 0;
            // 404/410 = subscription no longer valid
            if (code === 404 || code === 410) {
              await this.sub.updateOne(
                { _id: s._id },
                { $set: { active: false, lastFailedAt: new Date() } },
              );
              this.log.debug(`Deactivated gone endpoint ${s.endpoint}`);
            }
            return { endpoint: s.endpoint, ok: false as const, code };
          }
        })
      );
    }

    const results = await Promise.all(tasks);
    const errors = results.filter(r => !r.ok).map(({ endpoint, code }) => ({ endpoint, code }));
    return { ok: errors.length === 0, failed: errors.length, errors };
  }

}
