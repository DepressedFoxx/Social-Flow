import { spawnSync } from 'node:child_process';
import { Client } from 'pg';
const url =
  process.env.AUTH_TEST_DATABASE_URL ||
  'postgresql://socialflow:socialflow_local@localhost:55432/socialflow_auth_test?schema=public';
const parsed = new URL(url);
const database = parsed.pathname.slice(1);
if (!/^[a-z_]+_test$/.test(database))
  throw new Error('Use a dedicated database ending in _test');
const adminUrl = new URL(url);
adminUrl.pathname = '/postgres';
const client = new Client({ connectionString: adminUrl.toString() });
await client.connect();
try {
  const exists = await client.query('SELECT 1 FROM pg_database WHERE datname=$1', [
    database,
  ]);
  if (!exists.rowCount) await client.query('CREATE DATABASE "' + database + '"');
} finally {
  await client.end();
}
const env = {
  ...process.env,
  DATABASE_URL: url,
  NODE_ENV: 'test',
  WEB_ORIGIN: 'http://localhost:3017',
};
function run(args, cwd = process.cwd()) {
  const result = spawnSync(process.execPath, args, { cwd, env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
run(
  ['../../node_modules/prisma/build/index.js', 'migrate', 'deploy'],
  process.cwd() + '/apps/api',
);
if (!process.argv.includes('--prepare-only'))
  run(['--test', 'apps/api/test/auth.test.cjs', 'apps/api/test/meta.test.cjs']);
