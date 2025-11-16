// src/marketplace/product.controller.ts
import { Controller, Get, Post, Body, Param, Patch, Delete, Query } from '@nestjs/common';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Role } from 'src/user/user.enum';
import { ProductStatus } from './product.schema';

@Controller('products')
export class ProductController {
    constructor(private readonly service: ProductService) { }

    @Post()
    @Roles(Role.Admin)
    create(@Body() dto: CreateProductDto) {
        return this.service.create(dto);
    }

    // Customers: always active; ?category=<id> optional
    @Get('customer')
    findAllForCustomer(@Query('category') category?: string) {
        return this.service.findAllForCustomer({ category });
    }

    @Get('admin')
    @Roles(Role.Admin)
    findAllForAdmin(@Query('status') status?: ProductStatus) {
        return this.service.findAllForAdmin({ status });
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id);
    }

    // FULL update using CreateProductDto (send all fields)
    @Patch(':id')
    @Roles(Role.Admin)
    update(@Param('id') id: string, @Body() dto: CreateProductDto) {
        return this.service.update(id, dto);
    }

    @Delete(':id')
    @Roles(Role.Admin)
    remove(@Param('id') id: string) {
        return this.service.remove(id);
    }
}
