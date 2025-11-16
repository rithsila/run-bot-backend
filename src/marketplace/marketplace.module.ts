// src/marketplace/marketplace.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { MarketplaceService } from './marketplace.service';
import { MarketplaceController } from './marketplace.controller';

import { Category, CategorySchema } from './category.schema';
import { CategoryService } from './category.service';
import { CategoryController } from './category.controller';

import { Product, ProductSchema } from './product.schema';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Category.name, schema: CategorySchema },
      { name: Product.name, schema: ProductSchema },
    ]),
  ],
  controllers: [
    MarketplaceController,
    CategoryController,
    ProductController,
  ],
  providers: [
    MarketplaceService,
    CategoryService,
    ProductService,
  ],
  exports: [
    CategoryService,
    ProductService,
    MongooseModule,
  ],
})
export class MarketplaceModule {}
