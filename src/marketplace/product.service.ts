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
        const created = new this.productModel(dto);
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

        const updated = await this.productModel
            .findByIdAndUpdate(id, dto, { new: true, runValidators: true })
            .populate('category', 'name')
            .exec();

        if (!updated) throw new NotFoundException(`Product ${id} not found`);
        return updated;
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
        const filter: FilterQuery<ProductDocument> = { status: ProductStatus.Inactive };

        if (opts?.category) {
            if (!Types.ObjectId.isValid(opts.category)) {
                throw new BadRequestException('Invalid category id');
            }
            filter.category = new Types.ObjectId(opts.category);
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
