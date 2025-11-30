import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { Product, ProductDocument, ProductStatus } from './product.schema';
import { CreateProductDto } from './dto/create-product.dto';

@Injectable()
export class ProductService {
    constructor(
        @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    ) { }

    // Create
    async create(dto: CreateProductDto): Promise<Product> {
        if (!Types.ObjectId.isValid(dto.category)) {
            throw new BadRequestException('Invalid category id');
        }
        const payload = this.normalizeProductDto(dto);
        const created = new this.productModel(payload);
        return created.save();
    }

    // Get one
    async findOne(id: string): Promise<Product> {
        if (!Types.ObjectId.isValid(id)) throw new NotFoundException(`Invalid id: ${id}`);
        const doc = await this.productModel.findById(id).populate('category', 'name').exec();
        if (!doc) throw new NotFoundException(`Product ${id} not found`);
        return doc;
    }

    // FULL update (uses CreateProductDto)
    async update(id: string, dto: CreateProductDto): Promise<Product> {
        if (!Types.ObjectId.isValid(id)) throw new NotFoundException(`Invalid id: ${id}`);
        if (!Types.ObjectId.isValid(dto.category)) {
            throw new BadRequestException('Invalid category id');
        }

        const existing = await this.productModel.findById(id).lean();
        if (!existing) throw new NotFoundException(`Product ${id} not found`);

        const payload = this.normalizeProductDto(dto, existing);

        const updated = await this.productModel
            .findByIdAndUpdate(id, payload, {
                new: true,
                runValidators: true,
                context: 'query',
            })
            .populate('category', 'name')
            .exec();

        if (!updated) throw new NotFoundException(`Product ${id} not found`);
        return updated;
    }

    private normalizeProductDto(dto: CreateProductDto, current?: Product) {
        const billingInput = dto.billingPeriod ?? current?.billingPeriod ?? 0;
        const lifetime = dto.lifetime ?? current?.lifetime ?? billingInput === 0;

        if (!lifetime && billingInput < 1) {
            throw new BadRequestException('billingPeriod must be at least 1 unless lifetime is true');
        }

        const payload: any = { ...dto };
        payload.lifetime = lifetime;
        payload.billingPeriod = lifetime ? 0 : billingInput;
        return payload;
    }

    // Delete
    async remove(id: string): Promise<{ deleted: boolean }> {
        if (!Types.ObjectId.isValid(id)) throw new NotFoundException(`Invalid id: ${id}`);
        const res = await this.productModel.findByIdAndDelete(id).exec();
        if (!res) throw new NotFoundException(`Product ${id} not found`);
        return { deleted: true };
    }

    // Customer list: status=active, optional category filter
    async findAllForCustomer(opts?: { category?: string }): Promise<Product[]> {
        const filter: FilterQuery<ProductDocument> = { status: ProductStatus.Active };
        if (opts?.category) {

            filter.category = opts.category;
        }
        return this.productModel
            .find(filter)
            .sort({ createdAt: -1 })
            .populate('category', 'name')
            .lean()
            .exec();
    }

    // Admin list: optional status filter
    async findAllForAdmin(opts?: { status?: ProductStatus }): Promise<Product[]> {
        const filter: FilterQuery<ProductDocument> = {};
        if (opts?.status) filter.status = opts.status;

        return this.productModel
            .find(filter)
            .sort({ createdAt: -1 })
            .populate('category', 'name')
            .lean()
            .exec();
    }
}
