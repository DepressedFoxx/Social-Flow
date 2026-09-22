import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const randomToken = () => randomBytes(32).toString('base64url');
export const hashToken = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export const pkceChallenge = (value: string) =>
  createHash('sha256').update(value).digest('base64url');

export function tokensEqual(left: unknown, right: unknown): boolean {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
