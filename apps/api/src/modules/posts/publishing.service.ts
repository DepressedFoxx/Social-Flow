import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MetaPublisher } from './meta.publisher';
import { MetaError } from '../meta/meta.graph';

@Injectable()
export class PublishingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: MetaPublisher,
  ) {}
  async tick() {
    const expired = await this.prisma.publishAttempt.findMany({
      where: { status: 'PUBLISHING', leaseExpiresAt: { lte: new Date() } },
      take: 50,
    });
    for (const attempt of expired)
      await this.finish(
        attempt.id,
        attempt.dispatchStartedAt ? 'PUBLISH_UNCERTAIN' : 'LEASE_EXPIRED',
        attempt.dispatchStartedAt
          ? 'Chưa rõ kết quả đăng. Kiểm tra tài khoản trước khi thử lại.'
          : 'Lượt xử lý hết hạn trước khi gửi lệnh đăng. Bạn có thể thử lại.',
        true,
      );
    const due = await this.prisma.post.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: { lte: new Date() },
        channel: { isMock: false },
      },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      take: 20,
      select: { id: true, version: true },
    });
    for (const candidate of due) {
      const attempt = await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.post.updateMany({
          where: {
            id: candidate.id,
            version: candidate.version,
            status: 'SCHEDULED',
            scheduledAt: { lte: new Date() },
          },
          data: { status: 'PUBLISHING', version: { increment: 1 } },
        });
        if (!claimed.count) return null;
        return tx.publishAttempt.create({
          data: {
            postId: candidate.id,
            scheduleVersion: candidate.version,
            status: 'PUBLISHING',
            leaseExpiresAt: new Date(Date.now() + 600_000),
          },
        });
      });
      if (!attempt) continue;
      try {
        const externalId = await this.publisher.publish(candidate.id, attempt.id);
        await this.finish(attempt.id, undefined, undefined, false, externalId);
      } catch (error) {
        const failure =
          error instanceof MetaError
            ? error
            : new MetaError(
                'PUBLISH_UNCERTAIN',
                'Không xác định được kết quả. Kiểm tra tài khoản trước khi thử lại.',
                true,
              );
        if (failure.code === 'META_RECONNECT_REQUIRED') {
          const post = await this.prisma.post.findUnique({
            where: { id: candidate.id },
            select: { channelId: true },
          });
          if (post)
            await this.prisma.channel.update({
              where: { id: post.channelId },
              data: { isActive: false },
            });
        }
        await this.finish(attempt.id, failure.code, failure.message);
      }
    }
  }
  async finish(
    id: string,
    errorCode?: string,
    errorMessage?: string,
    expired = false,
    externalId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const attempt = await tx.publishAttempt.findUnique({ where: { id } });
      if (!attempt) return;
      const now = new Date();
      const changed = await tx.publishAttempt.updateMany({
        where: {
          id,
          status: 'PUBLISHING',
          leaseExpiresAt: expired ? { lte: now } : { gt: now },
        },
        data: {
          status: errorCode ? 'FAILED' : 'PUBLISHED',
          finishedAt: now,
          errorCode: errorCode ?? null,
          errorMessage: errorMessage ?? null,
          externalPostId: errorCode ? null : externalId,
        },
      });
      if (!changed.count) return;
      const updated = await tx.post.updateMany({
        where: {
          id: attempt.postId,
          status: 'PUBLISHING',
          version: attempt.scheduleVersion + 1,
        },
        data: {
          status: errorCode ? 'FAILED' : 'PUBLISHED',
          publishedAt: errorCode ? null : now,
          version: { increment: 1 },
        },
      });
      if (!updated.count) throw new Error('Publishing lease no longer owns post version');
    });
  }
}
