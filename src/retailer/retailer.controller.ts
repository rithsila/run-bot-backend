// src/retailer/retailer.controller.ts
import {
    Controller,
    Get,
    Inject,
    Req,
    Res,
    HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { RetailerService } from './retailer.service';

@Controller('retailer')
export class RetailerController {
    constructor(
        private readonly retailer: RetailerService,

    ) { }

    @Get()
    async getRetail(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
        const rows = await this.retailer.fetchRetailRows();
        res.status(HttpStatus.OK);
        return rows;
    }
    }
