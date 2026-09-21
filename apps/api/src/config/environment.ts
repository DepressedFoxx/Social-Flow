import { z } from 'zod';
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.url().default('http://localhost:3001'),
  DATABASE_URL: z
    .string()
    .min(1)
    .default(
      'postgresql://socialflow:socialflow_local@localhost:55432/socialflow?schema=public',
    ),
});
export function validateEnvironment(config: Record<string, unknown>) {
  return schema.parse(config);
}
