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
import { Direction } from 'src/trading-plan/trading-plan.enum';
import { PersistImageService } from 'src/common/persist-image.service';
import { RealtimeGateway } from 'src/real-time/realtime.gateway';
import { WebPushSubService } from 'src/web-push-sub/web-push-sub.service';
import { PushProducer } from 'src/queue/push.producer';
import { AwsS3Service } from 'src/storage/aws-s3.service';

type MulterFile = Express.Multer.File;

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
const MAX_THUMBNAIL_BYTES = 8 * 1024 * 1024;

@Injectable()
export class AnalyzeNewsService {
    constructor(
        @InjectModel(AnalyzeNews.name)
        private readonly newsModel: Model<AnalyzeNewsDocument>,
        private readonly s3: AwsS3Service,
        private readonly img: PersistImageService,
        private readonly realtime: RealtimeGateway,
        private readonly pushProducer: PushProducer,
        private readonly webPushSubService: WebPushSubService,
    ) {}

    async create(dto: CreateAnalyzeNewsDto, file?: MulterFile) {
        if (dto.impact == null) dto.impact = Direction.Bearish;

        const finalThumb = await this.resolveThumbnailUrl(dto, file);

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
                const count = await this.newsModel
                    .countDocuments({})
                    .session(session);
                const toDelete = Math.max(0, count - MAX_ANALYZE_NEWS + 1);

                if (toDelete > 0) {
                    const oldest = await this.newsModel
                        .find({})
                        .sort({ createdAt: 1 })
                        .limit(toDelete)
                        .select({ _id: 1 })
                        .lean()
                        .session(session);

                    const ids = oldest.map((d) => d._id);
                    if (ids.length) {
                        await this.newsModel
                            .deleteMany({ _id: { $in: ids } })
                            .session(session);
                    }
                }
                const [doc] = await this.newsModel.create([payload], {
                    session,
                });
                created = await this.newsModel
                    .findById(doc._id)
                    .lean<AnalyzeNewsLean>()
                    .session(session)
                    .orFail();
            });
        } catch (err: any) {
            // Standalone Mongo fallback (no replica set)
            if (
                String(err?.message || '').includes(
                    'Transaction numbers are only allowed on a replica set',
                )
            ) {
                const count = await this.newsModel.countDocuments({});

                const toDelete = Math.max(0, count - MAX_ANALYZE_NEWS + 1);

                if (toDelete > 0) {
                    const oldest = await this.newsModel
                        .find({})
                        .sort({ createdAt: 1 })
                        .limit(toDelete)
                        .select({ _id: 1 })
                        .lean();

                    const ids = oldest.map((d) => d._id);
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

        // ---- Push notification (tiny payload; SW will fetch full content by id) ----
        try {
            const tinyPayload = {
                title: 'New Analysis 📰',
                body: created.pair
                    ? `${created.title} • ${created.pair} • ${created.impact}`
                    : `${created.title} • ${created.impact}`,
            };

            // Exclude author if provided on dto (optional)
            const excludeId: Types.ObjectId | null = null;

            // Get recipients (all active users, optionally excluding author).
            const recipients = await this.webPushSubService.getUserIdsExcept(
                excludeId ?? new Types.ObjectId('000000000000000000000000'), // excludes no one if author unknown
            );

            console.log('=======AnalyzeNews.create', recipients);

            if (recipients.length) {
                await this.pushProducer.enqueueSendToUsers(
                    recipients,
                    tinyPayload,
                    { ttl: 3600, chunkSize: 500 },
                );
            }
        } catch (e) {
            // Don’t block creation on push failures
            console.warn('[AnalyzeNews.create] push enqueue failed:', e);
        }
        // ---------------------------------------------------------------------------

        this.realtime.publishBadge('news');

        return created;
    }

    async findAll() {
        return this.newsModel
            .find({})
            .sort({ createdAt: -1 })
            .lean<AnalyzeNewsLean[]>();
    }

    async findById(_id: Types.ObjectId) {
        const doc = await this.newsModel
            .findById(_id)
            .lean<AnalyzeNewsLean | null>();
        if (!doc) throw new NotFoundException('Analyze news not found');
        return doc;
    }

    async remove(_id: Types.ObjectId) {
        const deleted = await this.newsModel
            .findOneAndDelete({ _id })
            .lean<AnalyzeNewsLean | null>();
        if (!deleted) throw new NotFoundException('Analyze news not found');
        await this.deleteThumbnailIfNeeded(deleted.thumbnailUrl);
        return { ok: true, id: String(deleted._id) };
    }

    async update(
        _id: Types.ObjectId,
        dto: CreateAnalyzeNewsDto,
        file?: MulterFile,
    ) {
        const existing = await this.newsModel
            .findById(_id)
            .lean<AnalyzeNewsLean | null>();
        if (!existing) throw new NotFoundException('Analyze news not found');

        const finalThumb = await this.resolveThumbnailUrl(dto, file);

        const updated = await this.newsModel.findByIdAndUpdate(
            _id,
            {
                title: dto?.title,
                description: dto?.description,
                pair: dto?.pair,
                impact: dto?.impact,
                thumbnailUrl: finalThumb,
            },
            { new: true, lean: true },
        );

        if (!updated) throw new NotFoundException('Analyze news not found');
        if (existing.thumbnailUrl && existing.thumbnailUrl !== finalThumb) {
            await this.deleteThumbnailIfNeeded(existing.thumbnailUrl);
        }
        return updated;
    }

    async uploadThumbnailFile(
        file: MulterFile,
    ): Promise<{ thumbnailUrl: string }> {
        if (!file) throw new BadRequestException('FILE_REQUIRED');
        if (!file.buffer?.length) throw new BadRequestException('FILE_EMPTY');
        if (file.size > MAX_THUMBNAIL_BYTES)
            throw new BadRequestException('FILE_TOO_LARGE');
        if (!file.mimetype?.startsWith('image/'))
            throw new BadRequestException('FILE_NOT_IMAGE');

        const upload = await this.s3.uploadFile(file, {
            folder: 'analyze-news',
            cacheControl: 'public, max-age=31536000',
        });

        return { thumbnailUrl: upload.url };
    }

    private async resolveThumbnailUrl(
        dto: CreateAnalyzeNewsDto,
        file?: MulterFile,
    ): Promise<string> {
        if (file) {
            const { thumbnailUrl } = await this.uploadThumbnailFile(file);
            return thumbnailUrl;
        }

        let finalThumb = (dto.thumbnailUrl ?? '').trim();

        if (finalThumb) {
            try {
                const up = await this.img.uploadFromUrl(finalThumb, {
                    folder: 'analyze-news',
                });
                finalThumb = up.secure_url; // <- permanent URL
            } catch (e) {
                console.warn(
                    '[AnalyzeNews.create] thumbnail persist failed:',
                    e,
                );
                finalThumb = '';
            }
        }

        return finalThumb;
    }

    private async deleteThumbnailIfNeeded(
        thumbnailUrl?: string,
    ): Promise<void> {
        if (!thumbnailUrl) return;
        try {
            await this.s3.deleteFileByUrl(thumbnailUrl);
        } catch (e) {
            console.warn('[AnalyzeNews] delete thumbnail failed:', e);
        }
    }
}
