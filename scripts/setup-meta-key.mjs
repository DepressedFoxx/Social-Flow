import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const file = new URL('../apps/api/.env', import.meta.url);
const source = await readFile(file, 'utf8').catch((error) => {
  if (error.code === 'ENOENT') throw new Error('Chạy npm run env:setup trước.');
  throw error;
});
const current = source.match(/^META_TOKEN_ENCRYPTION_KEY=(.*)$/m)?.[1]?.trim();
if (current) {
  console.log('Đã có khóa Meta. Giữ nguyên khóa hiện tại.');
} else {
  const line = 'META_TOKEN_ENCRYPTION_KEY=' + randomBytes(32).toString('base64');
  const next = /^META_TOKEN_ENCRYPTION_KEY=.*$/m.test(source)
    ? source.replace(/^META_TOKEN_ENCRYPTION_KEY=.*$/m, line)
    : source.trimEnd() + '\n' + line + '\n';
  await writeFile(file, next);
  console.log('Đã thêm khóa mã hóa Meta vào apps/api/.env. Hãy sao lưu file an toàn.');
}
