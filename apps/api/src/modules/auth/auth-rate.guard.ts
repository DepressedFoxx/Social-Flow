import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';

@Injectable()
export class AuthRateGuard implements CanActivate {
  private readonly buckets = new Map<string, { count: number; until: number }>();

  canActivate(context: ExecutionContext) {
    const now = Date.now();
    for (const [key, bucket] of this.buckets)
      if (bucket.until <= now) this.buckets.delete(key);
    const request = context.switchToHttp().getRequest<Request>();
    const key = request.ip || 'unknown';
    const bucket = this.buckets.get(key) ?? { count: 0, until: now + 60_000 };
    bucket.count++;
    this.buckets.set(key, bucket);
    if (bucket.count > 10) {
      context
        .switchToHttp()
        .getResponse<Response>()
        .setHeader('Retry-After', Math.ceil((bucket.until - now) / 1000));
      throw new HttpException(
        {
          code: 'AUTH_RATE_LIMITED',
          message: 'Bạn thử quá nhiều lần. Vui lòng chờ một phút.',
        },
        429,
      );
    }
    return true;
  }
}
