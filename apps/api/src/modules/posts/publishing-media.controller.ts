import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { PrismaService } from '../../database/prisma.service';
import { MetaCrypto } from '../meta/meta.crypto';
import { MediaService } from '../media/media.service';

@Controller('publishing-media')
export class PublishingMediaController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: MetaCrypto,
    private readonly media: MediaService,
  ) {}
  @Get(':attemptId/:assetId')
  @Header('Cache-Control', 'no-store')
  async content(
    @Param('attemptId') attemptId: string,
    @Param('assetId') assetId: string,
    @Query('expires') expires: string,
    @Query('signature') signature: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (
      typeof expires !== 'string' ||
      typeof signature !== 'string' ||
      !/^\d{10}$/.test(expires) ||
      Number(expires) < Date.now() / 1000 ||
      Number(expires) > Date.now() / 1000 + 3600 ||
      !this.crypto.verify(attemptId + ':' + assetId + ':' + expires, signature)
    )
      throw new NotFoundException();
    const attempt = await this.prisma.publishAttempt.findFirst({
      where: {
        id: attemptId,
        status: { in: ['PUBLISHING', 'PUBLISHED'] },
        post: { media: { some: { mediaAssetId: assetId } } },
      },
      select: { post: { select: { workspaceId: true } } },
    });
    if (!attempt) throw new NotFoundException();
    const file = await this.media.content(attempt.post.workspaceId, assetId);
    response.type(file.asset.mimeType);
    response.setHeader('Content-Length', file.asset.size);
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    response.setHeader('Referrer-Policy', 'no-referrer');
    return new StreamableFile(createReadStream(file.path));
  }
}
