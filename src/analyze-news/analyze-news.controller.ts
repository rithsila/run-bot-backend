// src/analyze-news/analyze-news.controller.ts
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
  Req,
  UnauthorizedException,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthRequest } from 'src/common/types/auth-request.type';
import { ApiSuccess } from 'src/common/types/api-response.type';

import { AnalyzeNewsService } from './analyze-news.service';
import { CreateAnalyzeNewsDto } from './dto/create-analyze-news.dto';

@Controller('analyze-news')
export class AnalyzeNewsController {
  constructor(private readonly service: AnalyzeNewsService) { }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 30_000 } })
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async create(
    @Req() req: AuthRequest,
    @Body() dto: CreateAnalyzeNewsDto,
  ): Promise<ApiSuccess<unknown>> {
    const uid = req?.user?.userId;
    if (!uid) throw new UnauthorizedException('AUTH_REQUIRED');

    const news = await this.service.create(dto);

    return {
      success: true,
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
      path: req.url,
      code: 'CREATE_ANALYZE_NEWS',
      message: 'Success!',
      data: news,
    };
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(@Req() req: AuthRequest): Promise<ApiSuccess<unknown[]>> {
    const items = await this.service.findAll();
    return {
      success: true,
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      path: req.url,
      code: 'LIST_ANALYZE_NEWS',
      message: 'Success!',
      data: items,
    };
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ): Promise<ApiSuccess<unknown>> {
    const uid = req?.user?.userId;
    if (!uid) throw new UnauthorizedException('AUTH_REQUIRED');

    const item = await this.service.findById(id);

    return {
      success: true,
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      path: req.url,
      code: 'GET_ANALYZE_NEWS',
      message: 'Success!',
      data: item,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ): Promise<ApiSuccess<{ ok: true; id: string }>> {
    const uid = req?.user?.userId;
    if (!uid) throw new UnauthorizedException('AUTH_REQUIRED');

    const result = await this.service.remove(id);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      path: req.url,
      code: 'DELETE_ANALYZE_NEWS',
      message: 'Success!',
    };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: CreateAnalyzeNewsDto, // reuse Create DTO as partial
  ): Promise<ApiSuccess<unknown>> {
    const uid = req?.user?.userId;
    if (!uid) throw new UnauthorizedException('AUTH_REQUIRED');

    const updated = await this.service.update(id, dto);

    return {
      success: true,
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      path: req.url,
      code: 'UPDATE_ANALYZE_NEWS',
      message: 'Success!',
      data: updated,
    };
  }
}
