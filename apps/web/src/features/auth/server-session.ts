import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { API_URL } from '@/lib/api-client';
import type { AuthSession } from './types';

export const getServerSession = cache(async (): Promise<AuthSession | null> => {
  const token = (await cookies()).get('sf_session')?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const response = await fetch((process.env.API_INTERNAL_URL ?? API_URL) + '/auth/me', {
    headers: { Cookie: 'sf_session=' + token },
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
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
