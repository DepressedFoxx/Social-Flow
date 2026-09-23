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
  META_APP_ID: z.string().regex(/^\d*$/).default(''),
  META_ENABLE_INSTAGRAM: z.enum(['true', 'false']).default('false'),
  META_LOGIN_CONFIG_ID: z.string().regex(/^\d*$/).default(''),
  META_APP_SECRET: z.string().default(''),
  META_CALLBACK_URL: z.union([z.literal(''), z.url()]).default(''),
  META_GRAPH_VERSION: z
    .string()
    .regex(/^v\d+\.0$/)
    .default('v25.0'),
  META_TOKEN_ENCRYPTION_KEY: z
    .string()
    .refine(
      (value) => !value || Buffer.from(value, 'base64').length === 32,
      'Expected a 32-byte base64 encryption key',
    )
    .default(''),
  META_PUBLIC_API_ORIGIN: z
    .union([
      z.literal(''),
      origin.refine(
        (value) => value.startsWith('https://'),
        'Public media requires HTTPS',
      ),
    ])
    .default(''),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_CALLBACK_URL: z.url().default('http://localhost:4000/api/auth/google/callback'),
  MEDIA_STORAGE_PATH: z.string().min(1).default('.data/media'),
  MEDIA_UPLOAD_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(600),
});
export function validateEnvironment(config: Record<string, unknown>) {
  return schema.parse(config);
}
