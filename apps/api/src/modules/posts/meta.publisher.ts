import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { MetaCrypto } from '../meta/meta.crypto';
import { MetaError, MetaGraph } from '../meta/meta.graph';

@Injectable()
export class MetaPublisher {
  constructor(
    private readonly prisma: PrismaService,
    private readonly graph: MetaGraph,
    private readonly crypto: MetaCrypto,
    private readonly config: ConfigService,
  ) {}
  private async readyContainer(id: string, token: string) {
    for (let i = 0; i < 30; i++) {
      const state = await this.graph.call<{ status_code: string }>(id, token, {
        fields: 'status_code',
      });
      if (state.status_code === 'FINISHED') return;
      if (state.status_code === 'ERROR' || state.status_code === 'EXPIRED')
        throw new MetaError(
          'META_MEDIA_FAILED',
          'Meta không xử lý được ảnh. Kiểm tra định dạng, kích thước và tỉ lệ ảnh.',
        );
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new MetaError(
      'META_MEDIA_TIMEOUT',
      'Meta chưa xử lý xong ảnh. Chưa gửi lệnh đăng; bạn có thể thử lại.',
    );
  }
  async publish(postId: string, attemptId: string): Promise<string> {
    const post = await this.prisma.post.findUniqueOrThrow({
      where: { id: postId },
      include: {
        channel: { include: { credential: true } },
        media: { include: { mediaAsset: true }, orderBy: { position: 'asc' } },
      },
    });
    const credential = post.channel.credential;
    if (post.channel.isMock || !post.channel.externalId || !credential)
      throw new MetaError(
        'META_RECONNECT_REQUIRED',
        'Chưa kết nối tài khoản thật. Hãy kết nối Meta và chọn lại tài khoản đăng.',
      );
    if (!post.channel.isActive)
      throw new MetaError('ACCOUNT_PAUSED', 'Tài khoản đăng đang tạm dừng.');
    if (credential.expiresAt && credential.expiresAt <= new Date())
      throw new MetaError(
        'META_RECONNECT_REQUIRED',
        'Kết nối đã hết hạn. Hãy kết nối lại Meta.',
      );
    if (!this.graph.ready)
      throw new MetaError('META_NOT_CONFIGURED', 'Máy chủ chưa cấu hình Meta.');
    if (post.media.some(({ mediaAsset }) => mediaAsset.status !== 'READY'))
      throw new MetaError('INVALID_MEDIA', 'Ảnh chưa sẵn sàng.');
    if (
      post.channel.platform === 'INSTAGRAM' &&
      (!post.media.length ||
        post.media.some(({ mediaAsset }) => mediaAsset.mimeType !== 'image/jpeg'))
    )
      throw new MetaError(
        'INSTAGRAM_JPEG_REQUIRED',
        'Instagram cần ảnh JPEG. Hãy đổi ảnh trước khi đăng.',
      );
    const publicOrigin = this.config.get<string>('META_PUBLIC_API_ORIGIN');
    if (post.media.length && !publicOrigin)
      throw new MetaError(
        'PUBLIC_MEDIA_REQUIRED',
        'Máy chủ chưa có địa chỉ HTTPS công khai để Meta đọc ảnh.',
      );
    const token = this.crypto.open(credential.encryptedToken, post.channel.id);
    const mediaUrls = post.media.map(({ mediaAsset }) => {
      const expires = String(Math.floor(Date.now() / 1000) + 3600);
      const signature = this.crypto.sign(attemptId + ':' + mediaAsset.id + ':' + expires);
      return (
        publicOrigin +
        '/api/publishing-media/' +
        attemptId +
        '/' +
        mediaAsset.id +
        '?expires=' +
        expires +
        '&signature=' +
        signature
      );
    });
    const target = post.channel.externalId;
    let path: string;
    let params: Record<string, string>;
    if (post.channel.platform === 'FACEBOOK') {
      const attachments: { media_fbid: string }[] = [];
      for (const url of mediaUrls) {
        const image = await this.graph.call<{ id: string }>(
          target + '/photos',
          token,
          { url, published: 'false' },
          'POST',
        );
        if (!image.id)
          throw new MetaError('META_MEDIA_FAILED', 'Meta không trả về mã ảnh.');
        attachments.push({ media_fbid: image.id });
      }
      path = target + '/feed';
      params = {
        message: post.content,
        ...Object.fromEntries(
          attachments.map((item, index) => [
            'attached_media[' + index + ']',
            JSON.stringify(item),
          ]),
        ),
      };
    } else {
      const children: string[] = [];
      for (const url of mediaUrls) {
        const container = await this.graph.call<{ id: string }>(
          target + '/media',
          token,
          {
            image_url: url,
            ...(mediaUrls.length > 1
              ? { is_carousel_item: 'true' }
              : { caption: post.content }),
          },
          'POST',
        );
        if (!container.id)
          throw new MetaError('META_MEDIA_FAILED', 'Meta không trả về mã ảnh.');
        await this.readyContainer(container.id, token);
        children.push(container.id);
      }
      let creationId = children[0];
      if (children.length > 1) {
        const carousel = await this.graph.call<{ id: string }>(
          target + '/media',
          token,
          { media_type: 'CAROUSEL', children: children.join(','), caption: post.content },
          'POST',
        );
        if (!carousel.id)
          throw new MetaError('META_MEDIA_FAILED', 'Meta không trả về mã carousel.');
        await this.readyContainer(carousel.id, token);
        creationId = carousel.id;
      }
      path = target + '/media_publish';
      params = { creation_id: creationId };
    }
    // Persist the side-effect boundary. A crash after this point is an uncertain result, never an automatic retry.
    const claimed = await this.prisma.publishAttempt.updateMany({
      where: {
        id: attemptId,
        postId,
        status: 'PUBLISHING',
        leaseExpiresAt: { gt: new Date(Date.now() + 20_000) },
        post: {
          status: 'PUBLISHING',
          channel: { isActive: true, credential: { isNot: null } },
        },
      },
      data: { dispatchStartedAt: new Date() },
    });
    if (claimed.count !== 1)
      throw new MetaError(
        'PUBLISH_CANCELLED',
        'Lượt xử lý hết hạn hoặc tài khoản đã ngắt kết nối. Chưa gửi lệnh đăng.',
      );
    const result = await this.graph.call<{ id: string }>(
      path,
      token,
      params,
      'POST',
      true,
    );
    if (!result.id)
      throw new MetaError(
        'PUBLISH_UNCERTAIN',
        'Meta chưa trả về mã bài viết. Kiểm tra tài khoản trước khi thử lại.',
        true,
      );
    return result.id;
  }
}
