// src/plans/dto/list-plans-query.dto.ts
import { Type } from 'class-transformer';
import {
    IsEnum,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    Max,
    Min,
} from 'class-validator';
import { PlanCategory } from '../plan.enum';

export class ListPlansQueryDto {
 

    @IsOptional()
    @IsEnum(PlanCategory)
    category?: PlanCategory;
}
