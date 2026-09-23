import {
  Body,
  Controller,
  Get,
  Header,
  Req,
  UseGuards,
  Patch,
  Param,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import { SessionGuard } from './session.guard';
import type { AuthRequest } from './auth.types';
import { PrismaService } from '../../database/prisma.service';

class UpdateChannelDto {
  @IsBoolean() isActive!: boolean;
}
@Controller('channels')
@UseGuards(SessionGuard)
export class ChannelsController {
  constructor(private readonly prisma: PrismaService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  async list(@Req() request: AuthRequest) {
    const channels = await this.prisma.channel.findMany({
      where: { workspaceId: request.auth.workspace.id, isMock: false },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        name: true,
        platform: true,
        externalId: true,
        isMock: true,
        isActive: true,
        _count: { select: { posts: true } },
        credential: { select: { expiresAt: true, connectedAt: true } },
      },
    });
    return channels.map(({ credential, ...channel }) => ({
      ...channel,
      connected: Boolean(credential),
      isActive:
        channel.isActive &&
        Boolean(credential) &&
        (!credential?.expiresAt || credential.expiresAt > new Date()),
      expiresAt: credential?.expiresAt ?? null,
      connectedAt: credential?.connectedAt ?? null,
    }));
  }
  @Patch(':id')
  async update(
    @Req() request: AuthRequest,
    @Param('id') id: string,
    @Body() dto: UpdateChannelDto,
  ) {
    const channel = await this.prisma.channel.findFirst({
      where: { id, workspaceId: request.auth.workspace.id, isMock: false },
      include: { credential: true },
    });
    if (!channel) throw new NotFoundException('Không tìm thấy tài khoản.');
    if (
      dto.isActive &&
      (!channel.credential ||
        (channel.credential.expiresAt && channel.credential.expiresAt <= new Date()))
    )
      throw new BadRequestException('Hãy kết nối lại tài khoản Meta trước khi bật.');
    await this.prisma.channel.update({ where: { id }, data: dto });
    return { id, isActive: dto.isActive };
  }
}
