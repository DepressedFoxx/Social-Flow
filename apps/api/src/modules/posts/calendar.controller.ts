import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { SessionGuard } from '../auth/session.guard';
import type { AuthRequest } from '../auth/auth.types';
import { PrismaService } from '../../database/prisma.service';
class CalendarQuery {
  @IsISO8601({ strict: true }) from!: string;
  @IsISO8601({ strict: true }) to!: string;
  @IsOptional() @IsString() @MaxLength(100) channel?: string;
}
@Controller('calendar')
@UseGuards(SessionGuard)
export class CalendarController {
  constructor(private readonly prisma: PrismaService) {}
  @Get()
  async list(@Req() request: AuthRequest, @Query() query: CalendarQuery) {
    const from = new Date(query.from);
    const to = new Date(query.to);
    const duration = to.getTime() - from.getTime();
    if (!Number.isFinite(duration) || duration <= 0 || duration > 42 * 86400000)
      throw new BadRequestException('Khoảng lịch tối đa 42 ngày.');
    const where = {
      workspaceId: request.auth.workspace.id,
      scheduledAt: { gte: from, lt: to },
      ...(query.channel ? { channelId: query.channel } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.post.findMany({
        where,
        orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
        take: 500,
        select: {
          id: true,
          title: true,
          status: true,
          scheduledAt: true,
          channel: { select: { name: true, platform: true, isMock: true } },
        },
      }),
      this.prisma.post.count({ where }),
    ]);
    return { items, total };
  }
}
