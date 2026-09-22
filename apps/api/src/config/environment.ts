import { z } from 'zod';

const origin = z.url().refine((value) => {
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
}, 'Expected an HTTP(S) origin without a path or trailing slash');
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: origin.default('http://localhost:3000'),
  DATABASE_URL: z
    .string()
    .min(1)
    .default(
      'postgresql://socialflow:socialflow_local@localhost:55432/socialflow?schema=public',
    ),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_CALLBACK_URL: z.url().default('http://localhost:4000/api/auth/google/callback'),
  MEDIA_STORAGE_PATH: z.string().min(1).default('.data/media'),
  MEDIA_UPLOAD_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(600),
});
export function validateEnvironment(config: Record<string, unknown>) {
  return schema.parse(config);
}
