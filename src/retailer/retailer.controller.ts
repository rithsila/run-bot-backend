// src/retailer/retailer.controller.ts
import {
  Controller,
  Get,
} from '@nestjs/common';

import { RetailerService } from './retailer.service';


@Controller('retailer')
export class RetailerController {
  constructor(
    private readonly retailer: RetailerService, // Mongo upsert (latest only)
  ) { }

  @Get()
  async latest() {
    return this.retailer.getLatest();
  }

}
