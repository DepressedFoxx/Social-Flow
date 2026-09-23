import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHmac,
  timingSafeEqual,
} from 'node:crypto';

@Injectable()
export class MetaCrypto {
  constructor(private readonly config: ConfigService) {}
  private key() {
    const key = Buffer.from(
      this.config.get<string>('META_TOKEN_ENCRYPTION_KEY') ?? '',
      'base64',
    );
    if (key.length !== 32)
      throw new ServiceUnavailableException('Chưa cấu hình khóa bảo vệ kết nối Meta.');
    return key;
  }
  seal(value: string, context: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    cipher.setAAD(Buffer.from(context));
    const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), data]
      .map((part) => part.toString('base64url'))
      .join('.');
  }
  open(value: string, context: string) {
    const [iv, tag, data] = value
      .split('.')
      .map((part) => Buffer.from(part, 'base64url'));
    const cipher = createDecipheriv('aes-256-gcm', this.key(), iv);
    cipher.setAAD(Buffer.from(context));
    cipher.setAuthTag(tag);
    return Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8');
  }
  sign(value: string) {
    return createHmac('sha256', this.key()).update(value).digest('base64url');
  }
  verify(value: string, signature: string) {
    const expected = Buffer.from(this.sign(value));
    const actual = Buffer.from(signature);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}
