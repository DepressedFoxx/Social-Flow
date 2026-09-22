import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { API_URL } from '@/lib/api-client';
import type { AuthSession } from './types';

const SESSION_RETRY_DELAYS = [0, 150, 350];

async function fetchSession(url: string, token: string) {
  let lastFailure: unknown;
  for (const delay of SESSION_RETRY_DELAYS) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      return await fetch(url, {
        headers: { Cookie: 'sf_session=' + token },
        cache: 'no-store',
        signal: AbortSignal.timeout(3_000),
      });
    } catch (failure) {
      lastFailure = failure;
    }
  }
  throw new Error('Không thể kết nối API để xác minh phiên đăng nhập.', {
    cause: lastFailure,
  });
}

export const getServerSession = cache(async (): Promise<AuthSession | null> => {
  const token = (await cookies()).get('sf_session')?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const response = await fetchSession(
    (process.env.API_INTERNAL_URL ?? API_URL) + '/auth/me',
    token,
  );
  if (response.status === 401) return null;
  if (!response.ok)
    throw new Error('Không thể xác minh phiên đăng nhập. Vui lòng thử lại.');
  return response.json() as Promise<AuthSession>;
});

export async function requireSession() {
  const session = await getServerSession();
  if (!session) redirect('/login');
  return session;
}
