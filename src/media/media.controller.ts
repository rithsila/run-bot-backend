import { Controller, Delete, Get, Param, Body, Query } from '@nestjs/common';
import { MediaService } from './media.service';
import { Public } from 'src/auth/guard/public.decorator';

@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  // GET /media/sign?folder=news
  @Public()
  @Get('sign')
  sign(@Query('folder') folder = 'news') {
    // TODO: add auth if needed (e.g., only logged-in users can sign)
    return this.media.signUpload(folder);
  }

  // DELETE /media/:publicId
  @Delete(':publicId')
  async deleteOne(@Param('publicId') publicId: string) {
    // TODO: authz: ensure the requester owns this asset
    return this.media.deleteOne(publicId, 'image');
  }

  // DELETE /media  body: { publicIds: string[] }
  @Delete()
  async deleteMany(@Body() dto: { publicIds: string[] }) {
    // TODO: authz checks
    return this.media.deleteMany(dto.publicIds, 'image');
  }
}