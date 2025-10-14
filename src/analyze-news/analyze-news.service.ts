// src/analyze-news/analyze-news.service.ts
import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { AnalyzeNews, AnalyzeNewsDocument } from './analyze-news.schema';
import { CreateAnalyzeNewsDto } from './dto/create-analyze-news.dto';
import { WebPushSubService } from 'src/web-push-sub/web-push-sub.service';
import { Direction } from 'src/trading-plan/trading-plan.enum';
import { PersistImageService } from 'src/common/persist-image.service';

export type AnalyzeNewsLean = {
    _id: Types.ObjectId;
    title: string;
    pair?: string;
    impact: string;
    description: string;
    thumbnailUrl?: string;
    createdAt?: Date;
    updatedAt?: Date;
};
const MAX_ANALYZE_NEWS = 6;

@Injectable()
export class AnalyzeNewsService {
    constructor(
        @InjectModel(AnalyzeNews.name)
        private readonly newsModel: Model<AnalyzeNewsDocument>,
        private readonly push: WebPushSubService,
        private readonly img: PersistImageService,
    ) { }

    async create(dto: CreateAnalyzeNewsDto) {
        if (dto.impact == null) dto.impact = Direction.Bearish;

        // ---- persist thumbnail if provided
        let finalThumb = (dto.thumbnailUrl ?? "").trim();
        if (finalThumb) {
            try {
                // Always persist remote images to control lifetime; especially *.oaiusercontent.com
                const up = await this.img.uploadFromUrl(finalThumb, {
                    folder: "analyze-news",
                });
                finalThumb = up.secure_url;
            } catch (e) {
                // Log and fall back; DO NOT throw just because thumbnail failed
                console.warn("[AnalyzeNews.create] thumbnail persist failed:", e);
                finalThumb = ""; // or "/chart_thumbnail.png"
            }
        }

        let created!: AnalyzeNewsLean;

        const session = await this.newsModel.db.startSession();
        try {
            await session.withTransaction(async () => {
                // enforce max=6 (global, since no publishedBy in schema)
                const count = await this.newsModel.countDocuments({}).session(session);
                const toDelete = Math.max(0, count - MAX_ANALYZE_NEWS + 1);
                if (toDelete > 0) {
                    const oldest = await this.newsModel
                        .find({})
                        .sort({ createdAt: 1 })
                        .limit(toDelete)
                        .select({ _id: 1 })
                        .lean()
                        .session(session);

                    const ids = oldest.map(d => d._id);
                    if (ids.length) {
                        await this.newsModel.deleteMany({ _id: { $in: ids } }).session(session);
                    }
                }

                const [doc] = await this.newsModel.create([dto], { session });

                created = await this.newsModel
                    .findById(doc._id)
                    .lean<AnalyzeNewsLean>()
                    .session(session)
                    .orFail();
            });
        } catch (err: any) {
            // Fallback for standalone Mongo (no replica set)
            if (String(err?.message || '').includes('Transaction numbers are only allowed on a replica set')) {
                const count = await this.newsModel.countDocuments({});
                const toDelete = Math.max(0, count - MAX_ANALYZE_NEWS + 1);
                if (toDelete > 0) {
                    const oldest = await this.newsModel
                        .find({})
                        .sort({ createdAt: 1 })
                        .limit(toDelete)
                        .select({ _id: 1 })
                        .lean();

                    const ids = oldest.map(d => d._id);
                    if (ids.length) {
                        await this.newsModel.deleteMany({ _id: { $in: ids } });
                    }
                }

                const doc = await this.newsModel.create(dto);
                created = await this.newsModel.findById(doc._id).lean<AnalyzeNewsLean>().orFail();
            } else {
                throw err;
            }
        } finally {
            session.endSession();
        }

        // Push notification
        void this.push.broadcast(
            {
                title: 'New Analysis 📰',
                body: created.pair
                    ? `${created.title} • ${created.pair} • ${created.impact}`
                    : `${created.title} • ${created.impact}`,
                url: `/analyze-news/${created._id}`,
                ts: Date.now(),
            },
            60,
        );

        return created;
    }

    async findAll() {
        return this.newsModel.find({}).sort({ createdAt: -1 }).lean<AnalyzeNewsLean[]>();
    }

    async findById(id: string) {
        const _id = this.asObjectId(id, 'analysis id');
        const doc = await this.newsModel.findById(_id).lean<AnalyzeNewsLean | null>();
        if (!doc) throw new NotFoundException('Analyze news not found');
        return doc;
    }

    async remove(id: string) {
        const _id = this.asObjectId(id, 'analysis id');
        const deleted = await this.newsModel.findOneAndDelete({ _id }).lean<AnalyzeNewsLean | null>();
        if (!deleted) throw new NotFoundException('Analyze news not found');
        return { ok: true, id: String(deleted._id) };
    }

    // --- helpers ---
    private asObjectId(id: string, label = 'id') {
        if (!Types.ObjectId.isValid(id)) {
            throw new BadRequestException(`Invalid ${label}`);
        }
        return new Types.ObjectId(id);
    }
}
