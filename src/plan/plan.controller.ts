// src/plans/plan.controller.ts
import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Patch,
    Post,
    UsePipes,
    ValidationPipe,
} from '@nestjs/common';
import { PlanService } from './plan.service';
import { CreatePlanDto } from './dto/create-plan.dto';

@Controller('plan')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class PlanController {
    
    constructor(private readonly plans: PlanService) { }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    create(@Body() dto: CreatePlanDto) {
        return this.plans.create(dto);
    }

    @Get()
    list() {
        return this.plans.findAll();
    }

    @Get(':id')
    getOne(@Param('id') id: string) {
        return this.plans.findOne(id);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: CreatePlanDto) {
        return this.plans.update(id, dto);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    async remove(@Param('id') id: string) {
        await this.plans.remove(id);
    }
}
