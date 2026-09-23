import { ConfigService } from '@nestjs/config';
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
  channel: {
    select: {
      id: true,
      name: true,
      platform: true,
      isMock: true,
      isActive: true,
      credential: { select: { expiresAt: true } },
    },
  },
  attempts: { orderBy: { startedAt: 'desc' as const }, take: 20 },
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
    private readonly config: ConfigService,
  ) {}

  private channel(workspaceId: string, channelId: string) {
    return this.prisma.channel.findFirst({
      where: { id: channelId, workspaceId, isMock: false },
    });
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
    const { credential, ...channel } = post.channel;
    return {
      ...post,
      channel: {
        ...channel,
        isActive:
          channel.isActive &&
          !channel.isMock &&
          Boolean(credential) &&
          (!credential?.expiresAt || credential.expiresAt > new Date()),
      },
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
        where: {
          id,
          workspaceId,
          version: expectedVersion,
          status: { in: ['DRAFT', 'FAILED'] },
        },
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
      code: ['DRAFT', 'FAILED'].includes(current.status)
        ? 'VERSION_CONFLICT'
        : 'POST_NOT_EDITABLE',
      message:
        current.status === 'DRAFT'
          ? 'Bài viết đã được thay đổi ở nơi khác. Hãy tải lại trước khi lưu.'
          : 'Chỉ bản nháp hoặc bài lỗi mới có thể chỉnh sửa.',
    });
  }

  async changeSchedule(
    workspaceId: string,
    id: string,
    expectedVersion: number,
    action: 'create' | 'reschedule' | 'cancel' | 'now',
    rawDate?: string,
  ) {
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1)
      throw new BadRequestException({
        code: 'EXPECTED_VERSION_REQUIRED',
        message: 'Thiếu phiên bản bài viết hợp lệ.',
      });
    return this.prisma.$transaction(async (tx) => {
      const post = await tx.post.findFirst({
        where: { id, workspaceId },
        include: {
          channel: { include: { credential: true } },
          media: { include: { mediaAsset: true } },
          attempts: { orderBy: { startedAt: 'desc' }, take: 1 },
        },
      });
      if (!post) throw this.notFound();
      const allowed =
        action === 'create' || action === 'now'
          ? post.status === 'DRAFT' || post.status === 'FAILED'
          : post.status === 'SCHEDULED';
      if (post.version !== expectedVersion || !allowed)
        throw new ConflictException({
          code: 'SCHEDULE_CONFLICT',
          message:
            'Bài viết đã thay đổi hoặc trạng thái không cho phép. Hãy tải lại dữ liệu.',
        });
      const scheduledAt =
        action === 'cancel'
          ? null
          : action === 'now'
            ? new Date()
            : new Date(rawDate ?? '');
      if (scheduledAt) {
        if (post.attempts[0]?.errorCode === 'PUBLISH_UNCERTAIN')
          throw new ConflictException({
            code: 'PUBLISH_UNCERTAIN',
            message:
              'Kiểm tra trực tiếp tài khoản và xác nhận chưa đăng trước khi thử lại.',
          });
        if (
          post.channel.isMock ||
          !post.channel.externalId ||
          !post.channel.credential ||
          (post.channel.credential.expiresAt &&
            post.channel.credential.expiresAt <= new Date())
        )
          throw new BadRequestException({
            code: 'META_RECONNECT_REQUIRED',
            message: 'Hãy kết nối tài khoản Meta thật trước khi đăng.',
          });
        if (post.media.length && !this.config.get<string>('META_PUBLIC_API_ORIGIN'))
          throw new BadRequestException({
            code: 'PUBLIC_MEDIA_REQUIRED',
            message: 'Chưa cấu hình HTTPS công khai để Meta đọc ảnh.',
          });
        if (
          post.channel.platform === 'INSTAGRAM' &&
          post.media.some(({ mediaAsset }) => mediaAsset.mimeType !== 'image/jpeg')
        )
          throw new BadRequestException({
            code: 'INSTAGRAM_JPEG_REQUIRED',
            message: 'Instagram chỉ hỗ trợ ảnh JPEG. Hãy đổi định dạng ảnh.',
          });

        if (!post.channel.isActive)
          throw new BadRequestException({
            code: 'ACCOUNT_PAUSED',
            message: 'Tài khoản đăng đang tạm dừng.',
          });
        if (
          !Number.isFinite(scheduledAt.getTime()) ||
          (action !== 'now' && scheduledAt.getTime() < Date.now() + 5 * 60_000)
        )
          throw new BadRequestException({
            code: 'INVALID_SCHEDULE_TIME',
            message: 'Lịch đăng phải cách thời gian hiện tại ít nhất 5 phút.',
          });
        if (!post.content.trim() || post.content.length > 2000)
          throw new BadRequestException({
            code: 'POST_CONTENT_REQUIRED',
            message: 'Nội dung cần có từ 1 đến 2.000 ký tự trước khi lên lịch.',
          });
        if (post.channel.platform === 'INSTAGRAM' && !post.media.length)
          throw new BadRequestException({
            code: 'INSTAGRAM_IMAGE_REQUIRED',
            message: 'Bài Instagram cần ít nhất một ảnh trước khi lên lịch.',
          });
        if (
          post.media.some(
            ({ mediaAsset }) =>
              mediaAsset.status !== 'READY' || mediaAsset.workspaceId !== workspaceId,
          )
        )
          throw new BadRequestException({
            code: 'INVALID_MEDIA',
            message: 'Ảnh chưa sẵn sàng để lên lịch.',
          });
      }
      const changed = await tx.post.updateMany({
        where: { id, workspaceId, version: expectedVersion, status: post.status },
        data: {
          scheduledAt,
          status: action === 'cancel' ? 'DRAFT' : 'SCHEDULED',
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1)
        throw new ConflictException({
          code: 'SCHEDULE_CONFLICT',
          message: 'Lịch đã thay đổi ở nơi khác. Hãy tải lại dữ liệu.',
        });
      return this.present(
        await tx.post.findUniqueOrThrow({ where: { id }, select: postSelect }),
      );
    });
  }
  async acknowledgeUncertain(workspaceId: string, id: string, expectedVersion: number) {
    return this.prisma.$transaction(async (tx) => {
      const post = await tx.post.findFirst({
        where: { id, workspaceId },
        include: { attempts: { orderBy: { startedAt: 'desc' }, take: 1 } },
      });
      if (!post) throw this.notFound();
      if (
        post.status !== 'FAILED' ||
        post.version !== expectedVersion ||
        post.attempts[0]?.errorCode !== 'PUBLISH_UNCERTAIN'
      )
        throw new ConflictException('Trạng thái bài đã thay đổi. Hãy tải lại.');
      const updated = await tx.post.updateMany({
        where: { id, workspaceId, version: expectedVersion, status: 'FAILED' },
        data: { version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new ConflictException('Bài đã được thay đổi.');
      await tx.publishAttempt.update({
        where: { id: post.attempts[0].id },
        data: {
          errorCode: 'UNCERTAIN_ACKNOWLEDGED',
          errorMessage:
            'Chủ workspace đã xác nhận kiểm tra tài khoản và chưa có bài đăng.',
        },
      });
      return this.present(
        await tx.post.findUniqueOrThrow({ where: { id }, select: postSelect }),
      );
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
      where: {
        id,
        workspaceId,
        version: expectedVersion,
        status: 'DRAFT',
      },
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
