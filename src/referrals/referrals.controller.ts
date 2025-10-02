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
            broker?: string; // ObjectId
            user?: string;   // ObjectId
            partnerCode?: string;
            registerUrl?: string;
        },
    ) {
        return this.service.create(body);
    }

    @Get()
    findAll(
        @Query()
        query: { page?: number; limit?: number; broker?: string; user?: string;},
    ) {
        return this.service.findAll(query);
    }

    @Get(':id')
    findOne(@Param('id') id: string, @Query('includePartnerCode') includePartnerCode?: '1' | 'true') {
        return this.service.findOne(id, includePartnerCode === '1' || includePartnerCode === 'true');
    }

    @Patch(':id')
    update(
        @Param('id') id: string,
        @Body()
        body: {
            broker?: string;
            user?: string;
            partnerCode?: string;
            registerUrl?: string;
        },
    ) {
        return this.service.update(id, body);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.service.remove(id);
    }
}
