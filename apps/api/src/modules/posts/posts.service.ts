import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import type { CreatePostDto, ListPostsDto, UpdatePostDto } from './post.dto';

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

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
    return {
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
    } as const;
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
    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  async get(workspaceId: string, id: string) {
    const post = await this.prisma.post.findFirst({
      where: { id, workspaceId },
      select: this.select(),
    });
    if (!post) throw this.notFound();
    return post;
  }

  async create(workspaceId: string, dto: CreatePostDto) {
    await this.assertChannel(workspaceId, dto.channelId);
    return this.prisma.post.upsert({
      where: {
        workspaceId_clientRequestId: {
          workspaceId,
          clientRequestId: dto.clientRequestId,
        },
      },
      update: {},
      create: { workspaceId, ...dto },
      select: this.select(),
    });
  }

  async update(workspaceId: string, id: string, dto: UpdatePostDto) {
    if (dto.channelId) await this.assertChannel(workspaceId, dto.channelId);
    const { expectedVersion } = dto;
    const data: { title?: string; content?: string; channelId?: string } = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.content !== undefined) data.content = dto.content;
    if (dto.channelId !== undefined) data.channelId = dto.channelId;
    if (Object.keys(data).length === 0)
      throw new BadRequestException({
        code: 'POST_CHANGES_REQUIRED',
        message: 'Cần có ít nhất một nội dung thay đổi.',
      });
    const updated = await this.prisma.post.updateMany({
      where: { id, workspaceId, version: expectedVersion, status: 'DRAFT' },
      data: { ...data, version: { increment: 1 } },
    });
    if (updated.count === 1) return this.get(workspaceId, id);
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
