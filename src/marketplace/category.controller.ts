import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { Category } from './category.schema';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Role } from 'src/user/user.enum';
import { JwtAuthGuard } from 'src/auth/guard/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guard/roles.guard';

@Controller('categories')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
export class CategoryController {
    constructor(private readonly categoryService: CategoryService) { }

    @Post()
    create(@Body() dto: CreateCategoryDto): Promise<Category> {
        return this.categoryService.create(dto);
    }

    @Get()
    findAll(): Promise<Category[]> {
        return this.categoryService.findAll();
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: CreateCategoryDto): Promise<Category> {
        return this.categoryService.update(id, dto);
    }

    @Delete(':id')
    remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
        return this.categoryService.remove(id);
    }
}
