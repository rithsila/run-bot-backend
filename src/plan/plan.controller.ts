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
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Role } from 'src/user/user.enum';

@Controller('plan')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class PlanController {
    constructor(private readonly plans: PlanService) {}

    @Post()
    @Roles(Role.Admin)
    @HttpCode(HttpStatus.CREATED)
    create(@Body() dto: CreatePlanDto) {
        return this.plans.create(dto);
    }

    @Get()
    list() {
        return this.plans.findAll();
    }

    @Patch(':id')
    @Roles(Role.Admin)
    update(@Param('id') id: string, @Body() dto: CreatePlanDto) {
        return this.plans.update(id, dto);
    }

    @Delete(':id')
    @Roles(Role.Admin)
    @HttpCode(HttpStatus.NO_CONTENT)
    async remove(@Param('id') id: string) {
        await this.plans.remove(id);
    }
}
