import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { MediaService } from '../media/media.service';
import type { CreatePostDto, ListPostsDto, UpdatePostDto } from './post.dto';

const postSelect = {
  id: true,
  title: true,
  content: true,
  status: true,
  scheduledAt: true,
  publishedAt: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  channel: { select: { id: true, name: true, platform: true, isMock: true } },
  media: {
    orderBy: { position: 'asc' as const },
    select: {
      position: true,
      mediaAsset: {
        select: { id: true, filename: true, mimeType: true, size: true },
      },
    },
  },
} as const;
type SelectedPost = Prisma.PostGetPayload<{ select: typeof postSelect }>;

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaService: MediaService,
  ) {}

  private channel(workspaceId: string, channelId: string) {
    return this.prisma.channel.findFirst({ where: { id: channelId, workspaceId } });
  }

  private async assertChannel(workspaceId: string, channelId: string) {
    if (!(await this.channel(workspaceId, channelId)))
      throw new BadRequestException({
        code: 'INVALID_CHANNEL',
        message: 'Kênh không thuộc workspace hiện tại.',
        fieldErrors: { channelId: 'Hãy chọn một kênh hợp lệ.' },
      });
  }

  private notFound() {
    return new NotFoundException({
      code: 'POST_NOT_FOUND',
      message: 'Không tìm thấy bài viết.',
    });
  }

  private select() {
    return postSelect;
  }

  private present(post: SelectedPost) {
    return {
      ...post,
      media: post.media.map(({ position, mediaAsset }) => ({
        ...this.mediaService.publicAsset(mediaAsset),
        position,
      })),
    };
  }

  private async assertMedia(
    workspaceId: string,
    mediaAssetIds: string[],
    postId?: string,
  ) {
    const assets = await this.prisma.mediaAsset.findMany({
      where: { id: { in: mediaAssetIds }, workspaceId, status: 'READY' },
      include: { postMedia: true },
    });
    if (
      assets.length !== mediaAssetIds.length ||
      assets.some((asset) => asset.postMedia && asset.postMedia.postId !== postId)
    )
      throw new BadRequestException({
        code: 'INVALID_MEDIA',
        message: 'Một hoặc nhiều ảnh chưa sẵn sàng hoặc không thuộc workspace.',
        fieldErrors: { mediaAssetIds: 'Hãy upload lại ảnh không hợp lệ.' },
      });
  }

  async list(workspaceId: string, query: ListPostsDto) {
    const where: Prisma.PostWhereInput = { workspaceId };
    if (query.q)
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { content: { contains: query.q, mode: 'insensitive' } },
      ];
    if (query.status) where.status = query.status;
    if (query.channel) {
      const platform = query.channel.toUpperCase();
      where.channel = ['FACEBOOK', 'INSTAGRAM'].includes(platform)
        ? { platform: platform as 'FACEBOOK' | 'INSTAGRAM' }
        : { id: query.channel };
    }
    const orderBy: Prisma.PostOrderByWithRelationInput[] =
      query.sort === 'scheduledAt'
        ? [{ scheduledAt: { sort: query.order, nulls: 'last' } }, { id: query.order }]
        : [{ updatedAt: query.order }, { id: query.order }];
    const [total, items] = await this.prisma.$transaction([
      this.prisma.post.count({ where }),
      this.prisma.post.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: this.select(),
      }),
    ]);
    return {
      items: items.map((post) => this.present(post)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(workspaceId: string, id: string) {
    const post = await this.prisma.post.findFirst({
      where: { id, workspaceId },
      select: this.select(),
    });
    if (!post) throw this.notFound();
    return this.present(post);
  }

  async create(workspaceId: string, dto: CreatePostDto) {
    await this.assertChannel(workspaceId, dto.channelId);
    const existing = await this.prisma.post.findUnique({
      where: {
        workspaceId_clientRequestId: {
          workspaceId,
          clientRequestId: dto.clientRequestId,
        },
      },
      select: this.select(),
    });
    if (existing) return this.present(existing);
    await this.assertMedia(workspaceId, dto.mediaAssetIds);
    const { mediaAssetIds, ...data } = dto;
    const post = await this.prisma.post.upsert({
      where: {
        workspaceId_clientRequestId: {
          workspaceId,
          clientRequestId: dto.clientRequestId,
        },
      },
      update: {},
      create: {
        workspaceId,
        ...data,
        media: {
          create: mediaAssetIds.map((mediaAssetId, position) => ({
            position,
            mediaAsset: { connect: { id: mediaAssetId } },
          })),
        },
      },
      select: this.select(),
    });
    return this.present(post);
  }

  async update(workspaceId: string, id: string, dto: UpdatePostDto) {
    if (dto.channelId) await this.assertChannel(workspaceId, dto.channelId);
    if (dto.mediaAssetIds) await this.assertMedia(workspaceId, dto.mediaAssetIds, id);
    const { expectedVersion, mediaAssetIds } = dto;
    const data: { title?: string; content?: string; channelId?: string } = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.content !== undefined) data.content = dto.content;
    if (dto.channelId !== undefined) data.channelId = dto.channelId;
    if (Object.keys(data).length === 0 && mediaAssetIds === undefined)
      throw new BadRequestException({
        code: 'POST_CHANGES_REQUIRED',
        message: 'Cần có ít nhất một nội dung thay đổi.',
      });
    const post = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.post.updateMany({
        where: { id, workspaceId, version: expectedVersion, status: 'DRAFT' },
        data: { ...data, version: { increment: 1 } },
      });
      if (updated.count !== 1) return null;
      if (mediaAssetIds !== undefined) {
        await transaction.postMedia.deleteMany({ where: { postId: id } });
        if (mediaAssetIds.length)
          await transaction.postMedia.createMany({
            data: mediaAssetIds.map((mediaAssetId, position) => ({
              postId: id,
              mediaAssetId,
              position,
            })),
          });
      }
      return transaction.post.findFirst({
        where: { id, workspaceId },
        select: postSelect,
      });
    });
    if (post) return this.present(post);
    const current = await this.prisma.post.findFirst({ where: { id, workspaceId } });
    if (!current) throw this.notFound();
    throw new ConflictException({
      code: current.status === 'DRAFT' ? 'VERSION_CONFLICT' : 'POST_NOT_EDITABLE',
      message:
        current.status === 'DRAFT'
          ? 'Bài viết đã được thay đổi ở nơi khác. Hãy tải lại trước khi lưu.'
          : 'Chỉ bản nháp mới có thể chỉnh sửa.',
    });
  }

  async remove(workspaceId: string, id: string, rawVersion?: string) {
    const expectedVersion = Number(rawVersion);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1)
      throw new BadRequestException({
        code: 'EXPECTED_VERSION_REQUIRED',
        message: 'Thiếu phiên bản bài viết hợp lệ trong If-Match.',
      });
    const removed = await this.prisma.post.deleteMany({
      where: { id, workspaceId, version: expectedVersion, status: 'DRAFT' },
    });
    if (removed.count === 1) return;
    const current = await this.prisma.post.findFirst({ where: { id, workspaceId } });
    if (!current) throw this.notFound();
    throw new ConflictException({
      code: current.status === 'DRAFT' ? 'VERSION_CONFLICT' : 'POST_NOT_DELETABLE',
      message:
        current.status === 'DRAFT'
          ? 'Bài viết đã được thay đổi ở nơi khác. Hãy tải lại trước khi xóa.'
          : 'Chỉ bản nháp mới có thể xóa.',
    });
  }
}
