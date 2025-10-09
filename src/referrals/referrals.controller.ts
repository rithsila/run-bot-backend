// src/referrals/referrals.controller.ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ReferralsService } from './referrals.service';

@Controller('referrals')
export class ReferralsController {
    constructor(private readonly service: ReferralsService) { }

    @Post()
    create(
        @Body()
        body: {
            broker?: string;
            title: string;
            logoUrl?: string;
            partnerCode?: string;
            registerUrl?: string;
        },
    ) {
        return this.service.create(body);
    }

    @Get()
    findAll(
        @Query()
        query: { page?: number; limit?: number },
    ) {
        return this.service.findAll(query);
    }

}
