import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { hashToken, randomToken } from '../auth/auth.crypto';
import type { AuthRequest } from '../auth/auth.types';
import { MetaCrypto } from './meta.crypto';
import { MetaGraph, type MetaAccount } from './meta.graph';

@Injectable()
export class MetaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly graph: MetaGraph,
    private readonly crypto: MetaCrypto,
  ) {}
  async begin(request: AuthRequest) {
    const state = randomToken();
    const url = this.graph.authorizeUrl(state);
    await this.prisma.metaOAuth.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    // One pending connection per session prevents an older callback replacing a newer selection.
    await this.prisma.metaOAuth.deleteMany({
      where: { sessionHash: request.sessionHash },
    });
    await this.prisma.metaOAuth.create({
      data: {
        stateHash: hashToken(state),
        workspaceId: request.auth.workspace.id,
        sessionHash: request.sessionHash,
        expiresAt: new Date(Date.now() + 600_000),
      },
    });
    return { url };
  }
  async callback(request: AuthRequest, state: string, code?: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(state))
      throw new BadRequestException('Phiên kết nối không hợp lệ.');
    const where = {
      stateHash: hashToken(state),
      sessionHash: request.sessionHash,
      workspaceId: request.auth.workspace.id,
      expiresAt: { gt: new Date() },
      consumedAt: null,
    };
    const consumed = await this.prisma.metaOAuth.updateMany({
      where,
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1)
      throw new BadRequestException('Phiên kết nối đã hết hạn hoặc đã sử dụng.');
    if (!code) return;
    const accounts = await this.graph.discover(code);
    await this.prisma.metaOAuth.update({
      where: { stateHash: hashToken(state) },
      data: {
        payload: this.crypto.seal(JSON.stringify(accounts), request.auth.workspace.id),
        expiresAt: new Date(Date.now() + 600_000),
      },
    });
  }
  private async pendingRecord(request: AuthRequest) {
    return this.prisma.metaOAuth.findFirst({
      where: {
        workspaceId: request.auth.workspace.id,
        sessionHash: request.sessionHash,
        payload: { not: null },
        expiresAt: { gt: new Date() },
      },
    });
  }
  async pending(request: AuthRequest) {
    const row = await this.pendingRecord(request);
    if (!row?.payload) return { accounts: [], expiresAt: null };
    const accounts = JSON.parse(
      this.crypto.open(row.payload, request.auth.workspace.id),
    ) as MetaAccount[];
    return {
      expiresAt: row.expiresAt,
      accounts: accounts.map(({ id, name, platform, pageId }) => ({
        key: platform + ':' + id,
        id,
        name,
        platform,
        pageId,
      })),
    };
  }
  async connect(request: AuthRequest, keys: string[]) {
    const row = await this.pendingRecord(request);
    if (!row?.payload)
      throw new BadRequestException('Danh sách đã hết hạn. Hãy kết nối Meta lại.');
    const accounts = JSON.parse(
      this.crypto.open(row.payload, request.auth.workspace.id),
    ) as MetaAccount[];
    const selected = accounts.filter((account) =>
      keys.includes(account.platform + ':' + account.id),
    );
    if (selected.length !== keys.length)
      throw new BadRequestException(
        'Tài khoản không nằm trong danh sách được Meta cấp quyền.',
      );
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.metaOAuth.deleteMany({
        where: { stateHash: row.stateHash, expiresAt: { gt: new Date() } },
      });
      if (consumed.count !== 1)
        throw new ConflictException('Danh sách kết nối đã được sử dụng.');
      for (const account of selected) {
        const channel = await tx.channel.upsert({
          where: {
            workspaceId_platform_externalId: {
              workspaceId: request.auth.workspace.id,
              platform: account.platform,
              externalId: account.id,
            },
          },
          create: {
            workspaceId: request.auth.workspace.id,
            platform: account.platform,
            externalId: account.id,
            name: account.name,
            isMock: false,
            isActive: true,
          },
          update: { name: account.name, isMock: false, isActive: true },
        });
        const credential = {
          encryptedToken: this.crypto.seal(account.token, channel.id),
          expiresAt: account.expiresAt ? new Date(account.expiresAt) : null,
          pageId: account.pageId,
          connectedAt: new Date(),
        };
        await tx.channelCredential.upsert({
          where: { channelId: channel.id },
          create: { channelId: channel.id, ...credential },
          update: credential,
        });
      }
    });
    return { connected: selected.length };
  }
  async disconnect(workspaceId: string, id: string) {
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.channel.updateMany({
        where: { id, workspaceId, isMock: false },
        data: { isActive: false },
      });
      if (!changed.count) throw new NotFoundException('Không tìm thấy tài khoản.');
      await tx.channelCredential.deleteMany({ where: { channelId: id } });
    });
  }
}
