import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async get(workspaceId: string) {
    const now = new Date();
    const [draft, scheduled, published, failed, upcoming] =
      await this.prisma.$transaction([
        this.prisma.post.count({ where: { workspaceId, status: 'DRAFT' } }),
        this.prisma.post.count({ where: { workspaceId, status: 'SCHEDULED' } }),
        this.prisma.post.count({ where: { workspaceId, status: 'PUBLISHED' } }),
        this.prisma.post.count({ where: { workspaceId, status: 'FAILED' } }),
        this.prisma.post.findMany({
          where: { workspaceId, status: 'SCHEDULED', scheduledAt: { gte: now } },
          orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
          take: 5,
          select: {
            id: true,
            title: true,
            scheduledAt: true,
            channel: { select: { id: true, name: true, platform: true } },
          },
        }),
      ]);
    return {
      generatedAt: now.toISOString(),
      counts: {
        DRAFT: draft,
        SCHEDULED: scheduled,
        PUBLISHED: published,
        FAILED: failed,
      },
      upcoming: upcoming.map((post) => ({
        ...post,
        scheduledAt: post.scheduledAt!.toISOString(),
      })),
    };
  }
}
