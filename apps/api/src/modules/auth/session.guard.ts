import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { hashToken, tokensEqual } from './auth.crypto';
import { SESSION_COOKIE, type AuthRequest } from './auth.types';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token: unknown = request.cookies?.[SESSION_COOKIE];
    request.auth = await this.auth.current(token);
    request.sessionHash = hashToken(token as string);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      if (
        request.get('origin') !== this.config.getOrThrow<string>('WEB_ORIGIN') ||
        !tokensEqual(request.get('x-csrf-token'), request.auth.csrfToken)
      ) {
        throw new ForbiddenException({
          code: 'CSRF_REJECTED',
          message: 'Không thể xác thực yêu cầu. Vui lòng tải lại trang.',
        });
      }
    }
    return true;
  }
}
