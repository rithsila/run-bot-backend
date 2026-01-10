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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import type { File as MulterFile } from 'multer';
import type { AuthRequest } from 'src/common/types/auth-request.type';
import { ApiSuccess } from 'src/common/types/api-response.type';
import { AnalyzeNewsService } from './analyze-news.service';
import { CreateAnalyzeNewsDto } from './dto/create-analyze-news.dto';
import { Types } from 'mongoose';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Role } from 'src/user/user.enum';

const MAX_ANALYZE_NEWS_THUMB_BYTES = 8 * 1024 * 1024;

@Controller('analyze-news')
export class AnalyzeNewsController {
  constructor(private readonly service: AnalyzeNewsService) { }

  @Post()
  @Roles(Role.Creator, Role.Admin)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_ANALYZE_NEWS_THUMB_BYTES },
    }),
  )
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 30_000 } })
  async create(
    @Req() req: AuthRequest,
    @Body() dto: CreateAnalyzeNewsDto,
    @UploadedFile() file?: MulterFile,
  ): Promise<ApiSuccess<unknown>> {
    const uid = req?.user?.userId;
    if (!uid) throw new UnauthorizedException('AUTH_REQUIRED');

    const news = await this.service.create(dto, file);

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

  @Post('upload')
  @Roles(Role.Creator, Role.Admin)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_ANALYZE_NEWS_THUMB_BYTES },
    }),
  )
  @HttpCode(HttpStatus.CREATED)
  async uploadThumbnail(
    @Req() req: AuthRequest,
    @UploadedFile() file: MulterFile,
  ): Promise<ApiSuccess<{ thumbnailUrl: string }>> {
    const uid = req?.user?.userId;
    if (!uid) throw new UnauthorizedException('AUTH_REQUIRED');

    const { thumbnailUrl } = await this.service.uploadThumbnailFile(file);

    return {
      success: true,
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
      path: req.url,
      code: 'UPLOAD_ANALYZE_NEWS_THUMBNAIL',
      message: 'Uploaded successfully',
      data: { thumbnailUrl },
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
    @Param('id') id: Types.ObjectId,
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
  @Roles(Role.Creator, Role.Admin)
  @HttpCode(HttpStatus.OK)
  async remove(
    @Req() req: AuthRequest,
    @Param('id') id: Types.ObjectId,
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
  @Roles(Role.Creator, Role.Admin)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_ANALYZE_NEWS_THUMB_BYTES },
    }),
  )
  @HttpCode(HttpStatus.OK)
  async update(
    @Req() req: AuthRequest,
    @Param('id') id: Types.ObjectId,
    @Body() dto: CreateAnalyzeNewsDto, // reuse Create DTO as partial
    @UploadedFile() file?: MulterFile,
  ): Promise<ApiSuccess<unknown>> {
    const uid = req?.user?.userId;
    if (!uid) throw new UnauthorizedException('AUTH_REQUIRED');
    const updated = await this.service.update(id, dto, file);

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
