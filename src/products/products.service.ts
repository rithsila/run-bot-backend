import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Product, ProductDocument } from './product.schema';
import { CreateProductDto } from './dto/create-product.dto';

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
  ) {}

  async create(dto: CreateProductDto): Promise<Product> {
    return this.productModel.create(dto);
  }

  async findById(id: string): Promise<Product> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid product id');
    }
    const product = await this.productModel.findById(id).lean().exec();
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product as Product;
  }

  async remove(id: string): Promise<{ deleted: boolean }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid product id');
    }
    const res = await this.productModel.findByIdAndDelete(id).lean().exec();
    if (!res) {
      throw new NotFoundException('Product not found');
    }
    return { deleted: true };
  }

  async findAll(): Promise<Product[]> {
    return this.productModel.find({}).lean().exec();
  }

  async update(id: string, dto: CreateProductDto): Promise<Product> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid product id');
    }

    const updated = await this.productModel
      .findByIdAndUpdate(id, dto, { new: true, runValidators: true })
      .lean()
      .exec();

    if (!updated) {
      throw new NotFoundException('Product not found');
    }

    return updated as Product;
  }
}
