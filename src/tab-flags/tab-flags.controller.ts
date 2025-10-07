// src/TabBars/tab-flags.controller.ts
import {
  Controller,
  Get,
  Param,
  Req,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { TabFlagsService } from './tab-flags.service';

type AuthRequest = Request & { user: { _id: string } };

@Controller('tab-flags')
export class TabFlagsController {
  constructor(private readonly service: TabFlagsService) {}

  @Get('me')
  async getMine(@Req() req: AuthRequest) {
    const data = await this.service.getByUser(req.user._id);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      data,
      timestamp: new Date().toISOString(),
      path: req.url,
    };
  } 
}
