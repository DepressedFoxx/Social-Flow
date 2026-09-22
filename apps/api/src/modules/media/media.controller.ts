import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { createReadStream } from 'node:fs';
import type { Response } from 'express';
import { SessionGuard } from '../auth/session.guard';
import type { AuthRequest } from '../auth/auth.types';
import {
  CreateMediaUploadDto,
  ListMediaDto,
  MAX_MEDIA_SIZE,
  type UploadedMediaFile,
} from './media.dto';
import { MediaService } from './media.service';

@ApiTags('media')
@Controller('media')
@UseGuards(SessionGuard)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Req() request: AuthRequest, @Query() query: ListMediaDto) {
    return this.media.list(request.auth.workspace.id, query);
  }

  @Post('upload-url')
  async createUpload(@Req() request: AuthRequest, @Body() dto: CreateMediaUploadDto) {
    const upload = await this.media.createUpload(request.auth.workspace.id, dto);
    return {
      assetId: upload.assetId,
      uploadUrl: `/media/${upload.assetId}/upload?token=${encodeURIComponent(upload.token)}`,
      uploadExpiresAt: upload.uploadExpiresAt,
    };
  }

  @Post(':id/complete')
  complete(@Req() request: AuthRequest, @Param('id') id: string) {
    return this.media.complete(request.auth.workspace.id, id);
  }

  @Get(':id/content')
  @Header('Cache-Control', 'private, max-age=3600')
  async content(
    @Req() request: AuthRequest,
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.media.content(request.auth.workspace.id, id);
    response.type(result.asset.mimeType);
    response.setHeader('Content-Length', result.asset.size);
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    return new StreamableFile(createReadStream(result.path));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Req() request: AuthRequest, @Param('id') id: string) {
    await this.media.remove(request.auth.workspace.id, id);
  }
}

@ApiTags('media-upload')
@Controller('media')
export class MediaUploadController {
  constructor(private readonly media: MediaService) {}

  @Put(':id/upload')
  @HttpCode(204)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_MEDIA_SIZE } }))
  async upload(
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @UploadedFile() file?: UploadedMediaFile,
  ) {
    await this.media.upload(id, token, file);
  }
}
