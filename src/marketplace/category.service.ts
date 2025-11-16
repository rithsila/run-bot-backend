import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Category, CategoryDocument } from './category.schema';
import { CreateCategoryDto } from './dto/create-category.dto';

@Injectable()
export class CategoryService {
    constructor(
        @InjectModel(Category.name) private readonly categoryModel: Model<CategoryDocument>,
    ) { }

    async create(dto: CreateCategoryDto): Promise<Category> {
        const created = new this.categoryModel(dto);
        return created.save();
    }

    async findAll(): Promise<Category[]> {
        return this.categoryModel.find().lean();
    }

    async update(id: string, dto: CreateCategoryDto): Promise<Category> {
        if (!Types.ObjectId.isValid(id)) {
            throw new NotFoundException(`Invalid id: ${id}`);
        }
        const _id = new Types.ObjectId(id);

        const updated = await this.categoryModel.findByIdAndUpdate(_id, dto, {
            new: true,
            runValidators: true,
        });

        if (!updated) throw new NotFoundException(`Category ${id} not found`);
        return updated;
    }

    async remove(id: string): Promise<{ deleted: boolean }> {
        if (!Types.ObjectId.isValid(id)) {
            throw new NotFoundException(`Invalid id: ${id}`);
        }
        const _id = new Types.ObjectId(id);

        const res = await this.categoryModel.findByIdAndDelete(_id);
        if (!res) throw new NotFoundException(`Category ${id} not found`);
        return { deleted: true };
    }
}
