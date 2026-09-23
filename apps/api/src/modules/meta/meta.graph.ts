import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';

export class MetaError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly uncertain = false,
  ) {
    super(message);
  }
}
export type MetaAccount = {
  id: string;
  name: string;
  platform: 'FACEBOOK' | 'INSTAGRAM';
  pageId: string;
  token: string;
  expiresAt: string | null;
};

@Injectable()
export class MetaGraph {
  constructor(private readonly config: ConfigService) {}
  get ready() {
    return [
      'META_APP_ID',
      'META_APP_SECRET',
      'META_CALLBACK_URL',
      'META_GRAPH_VERSION',
      'META_TOKEN_ENCRYPTION_KEY',
    ].every((key) => Boolean(this.config.get<string>(key)));
  }
  authorizeUrl(state: string) {
    if (!this.ready)
      throw new ServiceUnavailableException('Chưa cấu hình kết nối Meta trên máy chủ.');
    const url = new URL(
      'https://www.facebook.com/' +
        this.config.getOrThrow<string>('META_GRAPH_VERSION') +
        '/dialog/oauth',
    );
    url.search = new URLSearchParams({
      client_id: this.config.getOrThrow<string>('META_APP_ID'),
      redirect_uri: this.config.getOrThrow<string>('META_CALLBACK_URL'),
      state,
      response_type: 'code',
      scope:
        'pages_show_list,pages_read_engagement,pages_manage_posts' +
        (this.config.get<string>('META_ENABLE_INSTAGRAM') === 'true'
          ? ',instagram_basic,instagram_content_publish'
          : ''),
      auth_type: 'rerequest',
    }).toString();
    const configuration = this.config.get<string>('META_LOGIN_CONFIG_ID');
    if (configuration) {
      url.searchParams.set('config_id', configuration);
      url.searchParams.delete('scope');
    }
    return url.toString();
  }
  // Tokens never go to the client, application logs, or arbitrary pagination URLs.
  async call<T>(
    path: string,
    token: string | null,
    params: Record<string, string> = {},
    method: 'GET' | 'POST' = 'GET',
    publishing = false,
  ): Promise<T> {
    const version = this.config.getOrThrow<string>('META_GRAPH_VERSION');
    const url = new URL('https://graph.facebook.com/' + version + '/' + path);
    const body = new URLSearchParams(params);
    if (token)
      body.set(
        'appsecret_proof',
        createHmac('sha256', this.config.getOrThrow<string>('META_APP_SECRET'))
          .update(token)
          .digest('hex'),
      );
    if (method === 'GET') url.search = body.toString();
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
        headers: {
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
          ...(method === 'POST'
            ? { 'Content-Type': 'application/x-www-form-urlencoded' }
            : {}),
        },
        ...(method === 'POST' ? { body } : {}),
      });
    } catch {
      throw new MetaError(
        publishing ? 'PUBLISH_UNCERTAIN' : 'META_UNAVAILABLE',
        publishing
          ? 'Chưa xác định được kết quả đăng. Kiểm tra trực tiếp trên tài khoản trước khi thử lại.'
          : 'Không thể kết nối Meta. Vui lòng thử lại sau.',
        publishing,
      );
    }
    const data = (await response.json().catch(() => null)) as {
      error?: { code?: number };
    } | null;
    if (!response.ok || !data || data.error) {
      const code = data?.error?.code;
      if (code === 190)
        throw new MetaError(
          'META_RECONNECT_REQUIRED',
          'Kết nối Meta hết hạn hoặc bị thu hồi. Hãy kết nối lại tài khoản.',
        );
      if (code === 10 || code === 200)
        throw new MetaError(
          'META_PERMISSION_REQUIRED',
          'Meta chưa cấp đủ quyền đăng bài. Hãy kiểm tra quyền và kết nối lại.',
        );
      if (publishing && (response.status >= 500 || !data))
        throw new MetaError(
          'PUBLISH_UNCERTAIN',
          'Chưa xác định được kết quả đăng. Kiểm tra trên tài khoản trước khi thử lại.',
          true,
        );
      throw new MetaError(
        'META_REJECTED',
        'Meta từ chối yêu cầu' +
          (code ? ' (mã ' + code + ')' : '') +
          '. Kiểm tra quyền, nội dung và định dạng ảnh.',
      );
    }
    return data as T;
  }
  async discover(code: string): Promise<MetaAccount[]> {
    const short = await this.call<{ access_token: string }>('oauth/access_token', null, {
      client_id: this.config.getOrThrow<string>('META_APP_ID'),
      client_secret: this.config.getOrThrow<string>('META_APP_SECRET'),
      redirect_uri: this.config.getOrThrow<string>('META_CALLBACK_URL'),
      code,
    });
    const long = await this.call<{ access_token: string; expires_in?: number }>(
      'oauth/access_token',
      null,
      {
        grant_type: 'fb_exchange_token',
        client_id: this.config.getOrThrow<string>('META_APP_ID'),
        client_secret: this.config.getOrThrow<string>('META_APP_SECRET'),
        fb_exchange_token: short.access_token,
      },
    );
    const permissions = await this.call<{
      data: { permission: string; status: string }[];
    }>('me/permissions', long.access_token);
    const granted = new Set(
      permissions.data.filter((p) => p.status === 'granted').map((p) => p.permission),
    );
    if (!granted.has('pages_show_list') || !granted.has('pages_read_engagement'))
      throw new MetaError(
        'META_PERMISSION_REQUIRED',
        'Cần cấp quyền xem danh sách Page và đọc thông tin Page.',
      );
    const expiresAt = long.expires_in
      ? new Date(Date.now() + long.expires_in * 1000).toISOString()
      : null;
    const accounts: MetaAccount[] = [];
    let after: string | undefined;
    for (let page = 0; page < 50; page++) {
      const result = await this.call<{
        data: {
          id: string;
          name: string;
          access_token?: string;
          tasks?: string[];
          instagram_business_account?: { id: string; username?: string };
        }[];
        paging?: { next?: string; cursors?: { after?: string } };
      }>('me/accounts', long.access_token, {
        fields:
          'id,name,access_token,tasks' +
          (granted.has('instagram_basic')
            ? ',instagram_business_account{id,username}'
            : ''),
        limit: '100',
        ...(after ? { after } : {}),
      });
      for (const page of result.data) {
        if (
          !page.access_token ||
          !page.tasks?.some((task) =>
            [
              'CREATE_CONTENT',
              'MANAGE',
              'PROFILE_PLUS_CREATE_CONTENT',
              'PROFILE_PLUS_FULL_CONTROL',
            ].includes(task),
          )
        )
          continue;
        if (granted.has('pages_manage_posts'))
          accounts.push({
            id: page.id,
            name: page.name,
            platform: 'FACEBOOK',
            pageId: page.id,
            token: page.access_token,
            expiresAt,
          });
        if (page.instagram_business_account && granted.has('instagram_content_publish'))
          accounts.push({
            id: page.instagram_business_account.id,
            name: page.instagram_business_account.username ?? page.name,
            platform: 'INSTAGRAM',
            pageId: page.id,
            token: page.access_token,
            expiresAt,
          });
      }
      if (!result.paging?.next) return accounts;
      after = result.paging.cursors?.after;
      if (!after)
        throw new MetaError(
          'META_PAGINATION_FAILED',
          'Không thể lấy đầy đủ danh sách Page. Hãy kết nối lại.',
        );
    }
    throw new MetaError(
      'META_TOO_MANY_PAGES',
      'Quá nhiều Page trong một lần kết nối. Giới hạn tài sản cấp quyền trong Meta.',
    );
  }
}
