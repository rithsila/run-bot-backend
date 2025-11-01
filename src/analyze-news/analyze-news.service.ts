// src/analyze-news/analyze-news.service.ts
import {
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectModel, ParseObjectIdPipe } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { AnalyzeNews, AnalyzeNewsDocument } from './analyze-news.schema';
import { CreateAnalyzeNewsDto } from './dto/create-analyze-news.dto';
import { WebPushSubService } from 'src/web-push-sub/web-push-sub.service';
import { Direction } from 'src/trading-plan/trading-plan.enum';
import { PersistImageService } from 'src/common/persist-image.service';
import { RealtimeGateway } from 'src/real-time/realtime.gateway';

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
        private readonly realtime: RealtimeGateway
    ) { }

    async create(dto: CreateAnalyzeNewsDto) {
        if (dto.impact == null) dto.impact = Direction.Bearish;

        let finalThumb = (dto.thumbnailUrl ?? '').trim();

        if (finalThumb) {
            try {
                const up = await this.img.uploadFromUrl(finalThumb, {
                    folder: 'analyze-news',
                });
                finalThumb = up.secure_url; // <- permanent URL
            } catch (e) {
                console.warn('[AnalyzeNews.create] thumbnail persist failed:', e);
                finalThumb = '';
            }
        }

        // 2) Build payload with the *persisted* URL (avoid saving empty string)
        const payload: CreateAnalyzeNewsDto = {
            ...dto,
            thumbnailUrl: finalThumb || undefined,
        };

        let created!: AnalyzeNewsLean;

        // 3) Enforce MAX=6 and create doc (transactional, with fallback)
        const session = await this.newsModel.db.startSession();
        try {
            await session.withTransaction(async () => {
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
                        await this.newsModel
                            .deleteMany({ _id: { $in: ids } })
                            .session(session);
                    }
                }


                const [doc] = await this.newsModel.create([payload], { session });


                created = await this.newsModel
                    .findById(doc._id)
                    .lean<AnalyzeNewsLean>()
                    .session(session)
                    .orFail();
            });
        } catch (err: any) {
            // Standalone Mongo fallback (no replica set)
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

                // IMPORTANT: use payload (NOT raw dto)
                const doc = await this.newsModel.create(payload);
                created = await this.newsModel
                    .findById(doc._id)
                    .lean<AnalyzeNewsLean>()
                    .orFail();
            } else {
                throw err;
            }
        } finally {
            session.endSession();
        }

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

        this.realtime.publishBadge('news');

        return created;
    }

    async findAll() {
        return this.newsModel.find({}).sort({ createdAt: -1 }).lean<AnalyzeNewsLean[]>();
    }

    async findById(_id: Types.ObjectId) {
        const doc = await this.newsModel.findById(_id).lean<AnalyzeNewsLean | null>();
        if (!doc) throw new NotFoundException('Analyze news not found');
        return doc;
    }

    async remove(_id: Types.ObjectId) {
        const deleted = await this.newsModel.findOneAndDelete({ _id }).lean<AnalyzeNewsLean | null>();
        if (!deleted) throw new NotFoundException('Analyze news not found');
        return { ok: true, id: String(deleted._id) };
    }

    async update(_id: Types.ObjectId, dto: CreateAnalyzeNewsDto) {


        let finalThumb = (dto.thumbnailUrl ?? '').trim();

        if (finalThumb) {
            try {
                const up = await this.img.uploadFromUrl(finalThumb, {
                    folder: 'analyze-news',
                });
                finalThumb = up.secure_url; // <- permanent URL
            } catch (e) {
                console.warn('[AnalyzeNews.create] thumbnail persist failed:', e);
                finalThumb = '';
            }
        }


        const updated = await this.newsModel
            .findByIdAndUpdate(_id,
                {
                    title: dto?.title,
                    description: dto?.description,
                    pair: dto?.pair,
                    impact: dto?.impact,
                    thumbnailUrl: finalThumb
                },
                { new: true, lean: true },
            )


        if (!updated) throw new NotFoundException('Analyze news not found');
        return updated;
    }

}
