import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaService } from '../../database/prisma.service';
import { hashToken, tokensEqual } from '../auth/auth.crypto';
import {
  MAX_MEDIA_SIZE,
  MEDIA_TYPES,
  type CreateMediaUploadDto,
  type ListMediaDto,
  type UploadedMediaFile,
} from './media.dto';

@Injectable()
export class MediaService {
  private readonly root: string;
  private readonly ttlSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.root = path.resolve(config.getOrThrow<string>('MEDIA_STORAGE_PATH'));
    this.ttlSeconds = config.getOrThrow<number>('MEDIA_UPLOAD_TTL_SECONDS');
  }

  private notFound() {
    return new NotFoundException({
      code: 'MEDIA_NOT_FOUND',
      message: 'Không tìm thấy ảnh.',
    });
  }

  private filePath(storageKey: string) {
    const resolved = path.resolve(this.root, storageKey);
    if (!resolved.startsWith(this.root + path.sep)) throw this.notFound();
    return resolved;
  }

  private detectedMime(buffer: Buffer) {
    if (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    )
      return 'image/jpeg';
    if (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      return 'image/png';
    if (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    )
      return 'image/webp';
    return null;
  }

  async createUpload(workspaceId: string, dto: CreateMediaUploadDto) {
    await this.cleanupExpired();
    const id = randomUUID();
    const token = randomBytes(32).toString('base64url');
    const uploadExpiresAt = new Date(Date.now() + this.ttlSeconds * 1000);
    const asset = await this.prisma.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`SELECT "id" FROM "Workspace" WHERE "id" = ${workspaceId} FOR UPDATE`;
        const [workspace, allocated] = await Promise.all([
          transaction.workspace.findUnique({
            where: { id: workspaceId },
            select: { mediaQuotaBytes: true },
          }),
          transaction.mediaAsset.aggregate({
            where: { workspaceId },
            _sum: { size: true },
          }),
        ]);
        if (!workspace) throw this.notFound();
        if ((allocated._sum.size ?? 0) + dto.size > Number(workspace.mediaQuotaBytes))
          throw new PayloadTooLargeException({
            code: 'MEDIA_QUOTA_EXCEEDED',
            message: 'Dung lượng media của gói hiện tại không còn đủ.',
          });
        return transaction.mediaAsset.create({
          data: {
            id,
            workspaceId,
            filename: dto.filename,
            mimeType: dto.mimeType,
            size: dto.size,
            storageKey: `${workspaceId}/${id}`,
            uploadTokenHash: hashToken(token),
            uploadExpiresAt,
          },
          select: { id: true },
        });
      },
      { isolationLevel: 'Serializable' },
    );
    return { assetId: asset.id, token, uploadExpiresAt };
  }

  async list(workspaceId: string, query: ListMediaDto) {
    await this.cleanupExpired();
    const where = {
      workspaceId,
      ...(query.q
        ? { filename: { contains: query.q, mode: 'insensitive' as const } }
        : {}),
    };
    const [workspace, used, reserved, total, items] = await this.prisma.$transaction([
      this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { planCode: true, mediaQuotaBytes: true },
      }),
      this.prisma.mediaAsset.aggregate({
        where: { workspaceId, status: { in: ['UPLOADED', 'READY'] } },
        _sum: { size: true },
      }),
      this.prisma.mediaAsset.aggregate({
        where: { workspaceId, status: 'PENDING', uploadExpiresAt: { gt: new Date() } },
        _sum: { size: true },
      }),
      this.prisma.mediaAsset.count({ where }),
      this.prisma.mediaAsset.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          filename: true,
          mimeType: true,
          size: true,
          status: true,
          createdAt: true,
          postMedia: { select: { post: { select: { id: true, title: true } } } },
        },
      }),
    ]);
    if (!workspace) throw this.notFound();
    const usedBytes = used._sum.size ?? 0;
    const reservedBytes = reserved._sum.size ?? 0;
    const quotaBytes = Number(workspace.mediaQuotaBytes);
    return {
      planCode: workspace.planCode,
      quotaBytes,
      usedBytes,
      reservedBytes,
      remainingBytes: Math.max(0, quotaBytes - usedBytes - reservedBytes),
      items: items.map((asset) => ({
        id: asset.id,
        filename: asset.filename,
        mimeType: asset.mimeType,
        size: asset.size,
        status: asset.status,
        createdAt: asset.createdAt,
        contentPath: asset.status === 'READY' ? `/media/${asset.id}/content` : null,
        post: asset.postMedia?.post ?? null,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async upload(id: string, token: string | undefined, file?: UploadedMediaFile) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset) throw this.notFound();
    if (
      asset.status !== 'PENDING' ||
      !asset.uploadTokenHash ||
      !asset.uploadExpiresAt ||
      asset.uploadExpiresAt <= new Date() ||
      !tokensEqual(
        typeof token === 'string' ? hashToken(token) : token,
        asset.uploadTokenHash,
      )
    )
      throw new ForbiddenException({
        code: 'UPLOAD_URL_INVALID',
        message: 'URL upload không hợp lệ hoặc đã hết hạn.',
      });
    if (!file)
      throw new BadRequestException({
        code: 'FILE_REQUIRED',
        message: 'Chưa chọn file.',
      });
    if (file.size > MAX_MEDIA_SIZE || file.size !== asset.size)
      throw new BadRequestException({
        code: 'INVALID_FILE_SIZE',
        message: 'Dung lượng file không khớp hoặc vượt quá 5 MB.',
      });
    const detected = this.detectedMime(file.buffer);
    if (!detected || !MEDIA_TYPES.includes(detected) || detected !== asset.mimeType)
      throw new BadRequestException({
        code: 'INVALID_FILE_TYPE',
        message: 'File phải là ảnh JPEG, PNG hoặc WebP hợp lệ.',
      });
    const target = this.filePath(asset.storageKey);
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, file.buffer, { flag: 'wx' });
    await rename(temporary, target);
    await this.prisma.mediaAsset.update({
      where: { id },
      data: { status: 'UPLOADED' },
    });
  }

  async complete(workspaceId: string, id: string) {
    const asset = await this.prisma.mediaAsset.findFirst({ where: { id, workspaceId } });
    if (!asset) throw this.notFound();
    if (asset.status === 'READY') return this.publicAsset(asset);
    if (asset.status !== 'UPLOADED')
      throw new ConflictException({
        code: 'MEDIA_NOT_UPLOADED',
        message: 'Ảnh chưa được upload hoàn tất.',
      });
    const info = await stat(this.filePath(asset.storageKey)).catch(() => null);
    if (!info || info.size !== asset.size)
      throw new BadRequestException({
        code: 'MEDIA_VERIFICATION_FAILED',
        message: 'Không thể xác nhận file đã upload.',
      });
    const ready = await this.prisma.mediaAsset.update({
      where: { id },
      data: {
        status: 'READY',
        confirmedAt: new Date(),
        uploadTokenHash: null,
        uploadExpiresAt: null,
      },
    });
    return this.publicAsset(ready);
  }

  async content(workspaceId: string, id: string) {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id, workspaceId, status: 'READY' },
    });
    if (!asset) throw this.notFound();
    return { asset, path: this.filePath(asset.storageKey) };
  }

  async remove(workspaceId: string, id: string) {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id, workspaceId },
      include: { postMedia: true },
    });
    if (!asset) throw this.notFound();
    if (asset.postMedia)
      throw new ConflictException({
        code: 'MEDIA_IN_USE',
        message: 'Hãy lưu bài viết sau khi bỏ ảnh trước khi xóa asset.',
      });
    await this.prisma.mediaAsset.delete({ where: { id } });
    await unlink(this.filePath(asset.storageKey)).catch(() => undefined);
  }

  publicAsset(asset: { id: string; filename: string; mimeType: string; size: number }) {
    return {
      id: asset.id,
      filename: asset.filename,
      mimeType: asset.mimeType,
      size: asset.size,
      contentPath: `/media/${asset.id}/content`,
    };
  }

  private async cleanupExpired() {
    const stale = await this.prisma.mediaAsset.findMany({
      where: {
        postMedia: null,
        OR: [
          { uploadExpiresAt: { lt: new Date() } },
          { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        ],
      },
      select: { id: true, storageKey: true },
      take: 50,
    });
    if (!stale.length) return;
    await this.prisma.mediaAsset.deleteMany({
      where: { id: { in: stale.map((asset) => asset.id) } },
    });
    await Promise.all(
      stale.map((asset) =>
        unlink(this.filePath(asset.storageKey)).catch(() => undefined),
      ),
    );
  }
}
