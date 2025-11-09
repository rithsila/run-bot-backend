// src/plans/plan.service.ts
import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, FilterQuery } from 'mongoose';
import { Plan, PlanDocument } from './plan.schema';
import { CreatePlanDto } from './dto/create-plan.dto';
import { PlanCategory } from './plan.enum';

export type SortField = 'createdAt' | 'price' | 'title';
export type SortOrder = 1 | -1;

export interface ListPlansOptions {
    page?: number;            // 1-based
    limit?: number;           // default 20
    category?: PlanCategory;
    q?: string;               // full-text search on title/description/features
    minPrice?: number;
    maxPrice?: number;
    sortBy?: SortField;
    order?: SortOrder;
}

@Injectable()
export class PlanService {
    constructor(
        @InjectModel(Plan.name) private readonly planModel: Model<PlanDocument>,
    ) { }

    private ensureId(id: string) {
        if (!id || !isValidObjectId(id)) {
            throw new BadRequestException('Invalid plan id');
        }
    }

    async create(dto: CreatePlanDto): Promise<Plan> {
        // Optional: prevent exact duplicate (title+billingPeriod+category)
        const exists = await this.planModel.exists({
            title: dto.title.trim(),
            billingPeriod: dto.billingPeriod,
            category: dto.category,
        } as FilterQuery<PlanDocument>);

        if (exists) {
            throw new BadRequestException(
                'A plan with the same title, billing period, and category already exists',
            );
        }
        const doc = new this.planModel({
            ...dto,
            title: dto.title?.trim(),
            description: dto.description?.trim() ?? '',
            paymentUrl: dto.paymentUrl?.trim(),
            features: dto.features?.trim() ?? '',
            marketingTagline: dto.marketingTagline?.trim() ?? '',
        });
        return await doc.save();
    }

    async findAll() {
        const items = await this.planModel
            .find()
            .sort({ createdAt: -1 })
            .lean()
            .exec()
        return items
    }



    async update(id: string, dto: CreatePlanDto): Promise<Plan> {
        this.ensureId(id);

        // Optional duplicate check on unique-ish tuple when fields provided
        if (dto.title || dto.billingPeriod || dto.category) {
            const probe: FilterQuery<PlanDocument> = {
                _id: { $ne: id },
                ...(dto.title ? { title: dto.title.trim() } : {}),
                ...(dto.billingPeriod ? { billingPeriod: dto.billingPeriod } : {}),
                ...(dto.category ? { category: dto.category } : {}),
            };
            // only run exists() if at least two of the tuple parts present, to reduce false positives
            const tupleParts =
                (dto.title ? 1 : 0) + (dto.billingPeriod ? 1 : 0) + (dto.category ? 1 : 0);
            if (tupleParts >= 2) {
                const dupe = await this.planModel.exists(probe);
                if (dupe) {
                    throw new BadRequestException(
                        'Another plan with these attributes already exists',
                    );
                }
            }
        }

        const updateDoc: Partial<Plan> = {
            ...dto,
            ...(dto.title !== undefined ? { title: dto.title?.trim() } : {}),
            ...(dto.description !== undefined
                ? { description: dto.description?.trim() ?? '' }
                : {}),
            ...(dto.paymentUrl !== undefined
                ? { paymentUrl: dto.paymentUrl?.trim() }
                : {}),
            ...(dto.features !== undefined ? { features: dto.features?.trim() ?? '' } : {}),
            ...(dto.marketingTagline !== undefined
                ? { marketingTagline: dto.marketingTagline?.trim() ?? '' }
                : {}),
        };

        const doc = await this.planModel
            .findByIdAndUpdate(id, updateDoc, { new: true, runValidators: true })
            .lean<Plan>()
            .exec();

        if (!doc) throw new NotFoundException('Plan not found');
        return doc;
    }

    async remove(id: string): Promise<{ deleted: boolean }> {
        this.ensureId(id);
        const res = await this.planModel.findByIdAndDelete(id).exec();
        if (!res) throw new NotFoundException('Plan not found');
        return { deleted: true };
    }
}
