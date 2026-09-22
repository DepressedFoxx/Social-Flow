import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(
      password,
      salt,
      64,
      { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return 'scrypt-v1:' + salt.toString('hex') + ':' + key.toString('hex');
}

export async function verifyPassword(password: string, stored?: string | null) {
  const parts = stored?.match(/^scrypt-v1:([a-f0-9]{32}):([a-f0-9]{128})$/);
  // Unknown users and Google-only accounts also perform the expensive hash operation.
  const salt = parts ? Buffer.from(parts[1], 'hex') : Buffer.alloc(16);
  const expected = parts ? Buffer.from(parts[2], 'hex') : Buffer.alloc(64);
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, expected) && Boolean(parts);
}
